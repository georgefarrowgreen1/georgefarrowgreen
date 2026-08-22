# models/

Drop `.gguf` files in here and `./setup.sh` will offer them alongside the
models it can download.

    cp ~/Downloads/Qwen3-8B-Q4_K_M.gguf  models/

Then `./setup.sh` and pick the `l1`, `l2`… entry. Nothing is downloaded and
nothing is copied — `run.sh` points llama-server straight at the file with
`-m`, so the weights stay exactly where you put them.

Quantisation is a filename convention, not something Blokk parses: `Q4_K_M`
is the usual balance, `Q5_K_M` if you have the memory, `Q8_0` if you have
plenty. `python3 bench.py` sizes your machine and says what fits.

Files here are gitignored — a few gigabytes each has no business in a repo,
and an update must never be able to overwrite your weights.

Only llama.cpp reads GGUF. MLX uses its own format, so a file here always
starts a llama.cpp server regardless of what `core/backends.py` would
otherwise prefer.
