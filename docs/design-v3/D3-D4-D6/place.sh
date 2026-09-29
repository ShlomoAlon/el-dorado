#!/bin/bash
# place.sh <srcdir> <label> <decision...>  -> docs/design-v3/D3-D4-D6/D<n>-<label>-<state>-<vw>.png
src=$1; label=$2; shift 2; dst=docs/design-v3/D3-D4-D6; mkdir -p $dst
for d in "$@"; do
  case $d in
    D3) st="mid allcards buying market";;
    D4) st="hand handcards market allcards";;
    D6) st="mid buying allcards chips";;
  esac
  for s in $st; do
    for vw in 1440 390; do
      [ -f $src/$s-$vw.png ] && cp $src/$s-$vw.png $dst/$d-$label-$s-$vw.png
    done
    [ -f $src/$s@2x.png ] && cp $src/$s@2x.png $dst/$d-$label-$s-1440@2x.png
    [ -f $src/$s-390@2x.png ] && cp $src/$s-390@2x.png $dst/$d-$label-$s-390@2x.png
  done
done
ls $dst | wc -l
