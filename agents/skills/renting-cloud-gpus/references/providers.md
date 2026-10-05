# Providers — dated prices (2026-10-05)

> Perishable. Vast.ai rows are LIVE measurements (`vastai==1.8.3 search offers … --raw`, 40 cheapest
> offers per query, 2026-10-05 ~20:30 JST); RunPod and Lambda rows are their official pricing pages
> fetched the same day. 円 at 150 円/$ (assumed). Monthly = ×730 h; "work days" = 8 h × 22.

## Vast.ai (marketplace, measured)

| Query | n | min $/h | median $/h | min ≈ 円/24 h | storage $/GB-mo |
|---|---|---|---|---|---|
| RTX 3090, verified | 33 | 0.135 | 0.216 | ≈ 490 | 0.20 |
| RTX 3090, verified + datacenter | 3 | 0.294 | 0.294 | ≈ 1,060 | 0.13 |
| RTX 4090, verified | 40 | 0.348 | 0.452 | ≈ 1,250 | 0.20 |
| RTX 4090, verified + datacenter | 3 | 0.470 | 0.829 | ≈ 1,690 | 0.53 |
| RTX 5090, verified | 40 | 0.469 | 0.601 | ≈ 1,690 | 0.33 |

A 500 円/日 budget (≈ $0.14/h) reaches the cheapest verified RTX 3090 only. "RTX 4090 from $0.13"
figures in comparison articles are unverified-host listings.

## RunPod (official, on-demand)

| GPU | Secure $/h | Community $/h | Secure ×730 h |
|---|---|---|---|
| RTX 4090 | 0.74 | 0.34 | $540 |
| RTX 5090 | 0.99 | 0.69 | $723 |
| L40S | 1.09 | 0.79 | $796 |
| A100 80GB | 1.59 | 1.19 | $1,161 |
| H100 PCIe | 2.89 | 1.99 | $2,110 |

Volume disk $0.10/GB-mo running, $0.20 idle.

## Lambda (official, on-demand, tax extra, storage included)

| GPU | $/h | ×730 h |
|---|---|---|
| Quadro RTX 6000 (24 GB) | 0.69 | $504 |
| A6000 (48 GB) | 1.09 | $796 |
| A10 (24 GB) | 1.29 | $942 |
| A100 40 GB | 1.99 | $1,453 |
| H100 PCIe | 3.29 | $2,402 |

## Not an option

Fly.io GPU Machines ended 2026-07-31 (vendor deprecation notice).
