"""Trains the per-map value network on samples from gen.mjs and exports it for the JS bot.
   python3 tools/ai/train.py <net.json> <course-id> <epochs> <data-prefix> [<data-prefix> ...]
Architecture (must match botNetValue in src/engine_bot.js): nf -> 128 -> 64 -> 1, leaky-ReLU(0.01), sigmoid.
Warm-starts from <net.json> if it exists. Loss: binary cross-entropy against targets in [0,1]."""
import sys, json, os, time, numpy as np, torch, torch.nn as nn
torch.set_num_threads(4)
out, course, epochs, prefixes = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
# sparse rows from gen.mjs → one big CSR matrix; dense mini-batches are built on the fly
L, I, V, Ys, nf = [], [], [], [], None
for p in prefixes:
    meta = json.load(open(p + '.json')); nf = meta['nf']
    L.append(np.fromfile(p + '.len.bin', dtype=np.uint32)); I.append(np.fromfile(p + '.idx.bin', dtype=np.uint16)); V.append(np.fromfile(p + '.val.bin', dtype=np.float32)); Ys.append(np.fromfile(p + '.Y.bin', dtype=np.float32))
lens = np.concatenate(L).astype(np.int64); ptr = np.concatenate([[0], np.cumsum(lens)]); IDX = torch.from_numpy(np.concatenate(I).astype(np.int64)); VAL = torch.from_numpy(np.concatenate(V))
Y = torch.from_numpy(np.concatenate(Ys)).unsqueeze(1); PTR = torch.from_numpy(ptr)
def dense(rows):
    rows = rows.numpy(); st, ln = ptr[rows], lens[rows]; tot = int(ln.sum())
    rr = np.repeat(np.arange(len(rows)), ln); off = np.arange(tot) - np.repeat(np.cumsum(ln) - ln, ln); src = torch.from_numpy(np.repeat(st, ln) + off)
    out = torch.zeros(len(rows), nf); out[torch.from_numpy(rr), IDX[src]] = VAL[src]; return out
H1, H2 = 128, 64
net = nn.Sequential(nn.Linear(nf, H1), nn.LeakyReLU(0.01), nn.Linear(H1, H2), nn.LeakyReLU(0.01), nn.Linear(H2, 1))
if os.path.exists(out):
    J = json.load(open(out))
    if J.get('nf') == nf and J.get('course') == course:
        with torch.no_grad():
            net[0].weight.copy_(torch.tensor(J['w1T']).view(nf, H1).T); net[0].bias.copy_(torch.tensor(J['b1']))
            net[2].weight.copy_(torch.tensor(J['w2']).view(H2, H1)); net[2].bias.copy_(torch.tensor(J['b2']))
            net[4].weight.copy_(torch.tensor(J['w3']).view(1, H2)); net[4].bias.copy_(torch.tensor(J['b3']))
perm = torch.randperm(len(Y)); nv = max(1, len(Y) // 20); vi, ti = perm[:nv], perm[nv:]
opt = torch.optim.Adam(net.parameters(), lr=1e-3, weight_decay=1e-5); lossf = nn.BCEWithLogitsLoss()
t0 = time.time()
for ep in range(epochs):
    net.train(); idx = ti[torch.randperm(len(ti))]
    for b in range(0, len(idx), 512):
        j = idx[b:b + 512]; opt.zero_grad(); l = lossf(net(dense(j)), Y[j]); l.backward(); opt.step()
net.eval()
with torch.no_grad():
    pv = torch.sigmoid(net(dense(vi))); rmse = float(((pv - Y[vi]) ** 2).mean().sqrt()); base = float(((Y[vi] - Y[ti].mean()) ** 2).mean().sqrt())
r = lambda t: [round(float(x), 6) for x in t.detach().flatten()]
J = {'course': course, 'nf': nf, 'w1T': r(net[0].weight.T.contiguous()), 'b1': r(net[0].bias), 'w2': r(net[2].weight), 'b2': r(net[2].bias), 'w3': r(net[4].weight), 'b3': r(net[4].bias)}
json.dump(J, open(out, 'w'))
print(json.dumps({'samples': len(Y), 'val_rmse': round(rmse, 4), 'predict_mean_rmse': round(base, 4), 'secs': round(time.time() - t0, 1)}))
