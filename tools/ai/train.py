"""Trains the per-map value network on samples from gen.mjs and exports it for the JS bot.
   python3 tools/ai/train.py <net.json> <course-id> <epochs> <data-prefix> [<data-prefix> ...]
Architecture (must match botNetValue in src/engine_bot.js): nf -> H1 -> H2 -> 1 (128 -> 64 for new networks), leaky-ReLU (slope
`leak` in the file), sigmoid; batch normalisation in training, folded into the weights on export.
Warm-starts from <net.json> if it exists. Loss: binary cross-entropy against targets in [0,1]."""
import sys, json, os, time, numpy as np, torch, torch.nn as nn
torch.set_num_threads(4)
out, course, epochs, prefixes = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
# sparse rows from gen.mjs → one big CSR matrix; dense mini-batches are built on the fly
L, I, V, Ys, Gs, nf, unsettled = [], [], [], [], [], None, False
for pi, p in enumerate(prefixes):
    meta = json.load(open(p + '.json')); nf = meta['nf']; unsettled = unsettled or bool(meta.get('unsettled'))
    L.append(np.fromfile(p + '.len.bin', dtype=np.uint32)); I.append(np.fromfile(p + '.idx.bin', dtype=np.uint16)); V.append(np.fromfile(p + '.val.bin', dtype=np.float32)); Ys.append(np.fromfile(p + '.Y.bin', dtype=np.float32))
    # game of each sample (older batches have none): validation holds out whole games, not single positions
    Gs.append(np.fromfile(p + '.gid.bin', dtype=np.uint32).astype(np.int64) + (pi << 24) if os.path.exists(p + '.gid.bin') else None)
lens = np.concatenate(L).astype(np.int64); ptr = np.concatenate([[0], np.cumsum(lens)]); IDX = torch.from_numpy(np.concatenate(I).astype(np.int64)); VAL = torch.from_numpy(np.concatenate(V))
Y = torch.from_numpy(np.concatenate(Ys)).unsqueeze(1); PTR = torch.from_numpy(ptr)
def dense(rows):
    rows = rows.numpy(); st, ln = ptr[rows], lens[rows]; tot = int(ln.sum())
    rr = np.repeat(np.arange(len(rows)), ln); off = np.arange(tot) - np.repeat(np.cumsum(ln) - ln, ln); src = torch.from_numpy(np.repeat(st, ln) + off)
    out = torch.zeros(len(rows), nf); out[torch.from_numpy(rr), IDX[src]] = VAL[src]; return out
H1, H2 = 128, 64
if os.path.exists(out):  # keep the size of an existing network (networks can be widened: tools/ai/widen.mjs)
    _J = json.load(open(out)); H1, H2 = len(_J['b1']), len(_J['b2']); del _J
class Net(nn.Module):
    """nf -> H1 -> H2 -> 1 with batch normalisation before each leaky ReLU. BatchNorm keeps every hidden unit centred on each
    training batch, so a unit cannot drift to being negative on every position (a dead unit). On export it is folded into the
    linear layers' weights and biases, so the network the game runs is unchanged in shape and speed (engine_bot.js)."""
    def __init__(s, leak, bn=True):
        super().__init__(); s.leak = leak
        s.l1, s.l2, s.l3 = nn.Linear(nf, H1), nn.Linear(H1, H2), nn.Linear(H2, 1)
        s.bn1, s.bn2 = (nn.BatchNorm1d(H1), nn.BatchNorm1d(H2)) if bn else (nn.Identity(), nn.Identity())
    def act(s, x): return nn.functional.leaky_relu(x, s.leak)
    def pre1(s, x): return s.bn1(s.l1(x))
    def pre2(s, x): return s.bn2(s.l2(s.act(s.pre1(x))))
    def forward(s, x): return s.l3(s.act(s.pre2(x)))
keep = {}  # multi-course networks carry their course list (and history) through training
J = json.load(open(out)) if os.path.exists(out) else {}
# negative slope of the leaky ReLU: TRAIN_LEAK switches an existing network to a new slope (older networks: 0.01)
LEAK = float(os.environ.get('TRAIN_LEAK') or J.get('leak', 0.01))
BN = os.environ.get('TRAIN_BN', '1') == '1'  # TRAIN_BN=0: no batch normalisation (the original recipe)
net = Net(LEAK, BN)
if J:
    keep = {k: J[k] for k in ('courses', 'from', 'onehot') if k in J}
    if J.get('nf') == nf and (J.get('course') == course or 'courses' in J):
        with torch.no_grad():
            net.l1.weight.copy_(torch.tensor(J['w1T']).view(nf, H1).T); net.l1.bias.copy_(torch.tensor(J['b1']))
            net.l2.weight.copy_(torch.tensor(J['w2']).view(H2, H1)); net.l2.bias.copy_(torch.tensor(J['b2']))
            net.l3.weight.copy_(torch.tensor(J['w3']).view(1, H2)); net.l3.bias.copy_(torch.tensor(J['b3']))
if all(g is not None for g in Gs):  # 5% of the games held out for validation (positions of one game are strongly correlated)
    G = np.concatenate(Gs); games = np.unique(G); held = np.random.default_rng().choice(games, max(1, len(games) // 20), replace=False)
    m = torch.from_numpy(np.isin(G, held)); vi, ti = torch.nonzero(m).flatten(), torch.nonzero(~m).flatten()
    vi, ti = vi[torch.randperm(len(vi))], ti[torch.randperm(len(ti))]
else:
    perm = torch.randperm(len(Y)); nv = max(1, len(Y) // 20); vi, ti = perm[:nv], perm[nv:]
# start each batch-norm layer as the identity (scale = the unit's spread, shift = its mean on this data), so training
# starts from exactly the network it was given
with torch.no_grad():
    xs = dense(ti[:8000]) if BN else None
    for l, bn, inp in ((l, bn, inp) for l, bn, inp in ((net.l1, net.bn1, lambda: xs), (net.l2, net.bn2, lambda: net.act(net.pre1(xs)))) if BN):
        net.eval(); z = l(inp()); m, v = z.mean(0), z.var(0, unbiased=False)
        bn.running_mean.copy_(m); bn.running_var.copy_(v); bn.weight.copy_((v + bn.eps).sqrt()); bn.bias.copy_(m)
    del xs
# AdamW (weight decay decoupled from the gradient; not on biases or batch-norm parameters), a warm-up and gradient clipping
# TRAIN_OPT=orig: the original optimiser (Adam, weight decay 1e-5 inside the gradient, no warm-up, no clipping)
LR, WARM, ORIG = float(os.environ.get('TRAIN_LR', '3e-4')), 300, os.environ.get('TRAIN_OPT') == 'orig'
if ORIG: WARM = 0
opt = torch.optim.Adam(net.parameters(), lr=LR, weight_decay=1e-5) if ORIG else torch.optim.AdamW([{'params': [net.l1.weight, net.l2.weight, net.l3.weight], 'weight_decay': 1e-2},
                         {'params': [net.l1.bias, net.l2.bias, net.l3.bias, *net.bn1.parameters(), *net.bn2.parameters()], 'weight_decay': 0}], lr=LR); lossf = nn.BCEWithLogitsLoss()
t0 = time.time(); step = 0
for ep in range(epochs):
    net.train(); idx = ti[torch.randperm(len(ti))]
    for b in range(0, len(idx), 512):
        j = idx[b:b + 512]
        if len(j) < 2: continue  # batch norm needs at least two positions
        step += 1
        for g in opt.param_groups: g['lr'] = LR * (min(1.0, step / WARM) if WARM else 1)
        opt.zero_grad(); l = lossf(net(dense(j)), Y[j]); l.backward()
        if not ORIG: nn.utils.clip_grad_norm_(net.parameters(), 1.0)
        opt.step()
net.eval()
# fold batch norm into the linear layers: bn(Wx + b) = s·(Wx + b − mean) + beta, s = gamma / sqrt(var + eps)
with torch.no_grad():
    def fold(l, bn):
        if not BN: return l.weight, l.bias
        s_ = bn.weight / (bn.running_var + bn.eps).sqrt(); return l.weight * s_[:, None], (l.bias - bn.running_mean) * s_ + bn.bias
    W1, B1 = fold(net.l1, net.bn1); W2, B2 = fold(net.l2, net.bn2); W3, B3 = net.l3.weight, net.l3.bias
    act = lambda x: nn.functional.leaky_relu(x, LEAK)
    fnet = lambda x: act(act(x @ W1.T + B1) @ W2.T + B2) @ W3.T + B3
    assert float((fnet(dense(vi[:500])) - net(dense(vi[:500]))).abs().max()) < 1e-3, 'batch-norm folding changed the output'
# dead hidden units: never positive on a fixed set of 4000 full-game positions (tools/ai/models/probe-full.*). Measured on this
# batch instead, a short-horizon curriculum stage would count late-game units (near El Dorado, …) as dead: they are unused, not broken.
PROBE = os.environ.get('PROBE', 'tools/ai/models/probe-full'); probe_x = None
if os.path.exists(PROBE + '.json') and json.load(open(PROBE + '.json'))['nf'] == nf:
    pl = np.fromfile(PROBE + '.len.bin', dtype=np.uint32).astype(np.int64); pp = np.concatenate([[0], np.cumsum(pl)]); pi_ = np.fromfile(PROBE + '.idx.bin', dtype=np.uint16).astype(np.int64); pv_ = np.fromfile(PROBE + '.val.bin', dtype=np.float32)
    probe_x = torch.zeros(len(pl), nf)
    for i in range(len(pl)): probe_x[i, torch.from_numpy(pi_[pp[i]:pp[i + 1]])] = torch.from_numpy(pv_[pp[i]:pp[i + 1]])
with torch.no_grad():
    xs = probe_x if probe_x is not None else dense(vi[:4000]); p1 = xs @ W1.T + B1; p2 = act(p1) @ W2.T + B2
    dead1, dead2 = int((p1.max(0).values <= 0).sum()), int((p2.max(0).values <= 0).sum())
    # the same count for the network this step started from (with its own slope): deaths caused by this training step
    if J and J.get('nf') == nf:
        lk0 = J.get('leak', 0.01); w1 = torch.tensor(J['w1T']).view(nf, H1); q1 = xs @ w1 + torch.tensor(J['b1']); a1 = torch.where(q1 > 0, q1, lk0 * q1)
        q2 = a1 @ torch.tensor(J['w2']).view(H2, H1).T + torch.tensor(J['b2']); dead1_0, dead2_0 = int((q1.max(0).values <= 0).sum()), int((q2.max(0).values <= 0).sum())
    else: dead1_0 = dead2_0 = 0
    xs = dense(vi[:4000]); p2 = act(xs @ W1.T + B1) @ W2.T + B2; ps = torch.sigmoid(act(p2) @ W3.T + B3); sat = float(((ps < .01) | (ps > .99)).float().mean()); bias = float(ps.mean() - Y[vi[:4000]].mean())
    wmax = max(float(t.abs().max()) for t in (W1, B1, W2, B2, W3, B3)); finite = all(bool(torch.isfinite(t).all()) for t in (W1, B1, W2, B2, W3, B3))
with torch.no_grad():
    pv = torch.sigmoid(fnet(dense(vi))); rmse = float(((pv - Y[vi]) ** 2).mean().sqrt()); base = float(((Y[vi] - Y[ti].mean()) ** 2).mean().sqrt())
# model-quality checks: warnings go to the log; a halt stops the training loop until someone finds the cause
warn, halt = [], None
for name, d, d0, H in (('layer 1', dead1, dead1_0, H1), ('layer 2', dead2, dead2_0, H2)):
    # stop when this training step killed many units (more than 10% of the layer at once) and the layer is over 30% dead;
    # units that were already dead in the starting network only warn
    if d > .30 * H and d - d0 > .10 * H: halt = f'{name}: {d}/{H} hidden units dead ({d - d0:+d} in this step)'
    elif d > .10 * H: warn.append(f'{name}: {d}/{H} hidden units dead ({d - d0:+d} in this step)')
if not finite: halt = 'non-finite weights'
if sat > .05: warn.append(f'{sat:.0%} of predictions saturated (<1% or >99%)')
if abs(bias) > .05: warn.append(f'predictions off by {bias:+.3f} on average (calibration)')
if rmse > .9 * base: warn.append(f'barely better than predicting the average (rmse {rmse:.3f} vs {base:.3f})')
if wmax > 10: warn.append(f'largest weight {wmax:.1f}')
r = lambda t: [round(float(x), 6) for x in t.detach().flatten()]
J = {**keep, 'course': 'multi' if 'courses' in keep else course, 'nf': nf, 'leak': LEAK, 'w1T': r(W1.T.contiguous()), 'b1': r(B1), 'w2': r(W2), 'b2': r(B2), 'w3': r(W3), 'b3': r(B3)}
if unsettled: J['unsettled'] = True  # trained on arrived-but-not-settled positions: play may ask the network about them (botValue)
json.dump(J, open(out, 'w'))
if os.environ.get('DEBUG_BN'):  # why did units die: their batch-norm scale (gamma) and shift (beta) vs the live ones
    with torch.no_grad():
        xs = probe_x if probe_x is not None else dense(vi[:4000]); q1 = xs @ W1.T + B1; q2 = act(q1) @ W2.T + B2
        for nm, q, bn in (('layer 1', q1, net.bn1), ('layer 2', q2, net.bn2)):
            d = q.max(0).values <= 0; g, b_ = bn.weight, bn.bias
            f = lambda m: f'gamma {float(g[m].abs().mean()):.3f}, beta {float(b_[m].mean()):+.3f}, beta/|gamma| {float((b_[m] / g[m].abs()).mean()):+.2f}' if m.any() else '-'
            sys.stderr.write(f'{nm}: dead {int(d.sum())} — {f(d)}  |  alive — {f(~d)}\n')
print(json.dumps({'samples': len(Y), 'val_rmse': round(rmse, 4), 'predict_mean_rmse': round(base, 4), 'dead1': f'{dead1}/{H1}', 'dead2': f'{dead2}/{H2}', 'dead_before': f'{dead1_0}/{H1} {dead2_0}/{H2}', 'dead_on': 'full-game probe' if probe_x is not None else 'this batch', 'saturated': round(sat, 4), 'bias': round(bias, 4), 'wmax': round(wmax, 2), 'warn': warn, 'halt': halt, 'secs': round(time.time() - t0, 1)}))
