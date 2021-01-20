# README

## Install

```
npm install express body-parser @iarna/toml minimist
```
## Server example

### Add transformation rules

Put [comby config files](https://comby.dev/docs/configuration#toml-format) in `rules`. See examples there, which are used by default.

### Running the server

Start the server:

```bash
$ export NODE_OPTIONS="--max-old-space-size=8192"
$ node server.js
[+] Loaded 109 transformation rules
[+] Mutation server listening at http://:::4448
```

**Parameters and defaults**

Flags that matter:

- `--port 5555` manually specify to listne on port `5555`. The default is `4448`.
- `--retries N` repicks a random mutation in the `rules` directory if the current one doesn't apply, up to `N` times.
- `--debug` prints out various debug info: source received, transformations picked and applied, etc.

Other supported flags can be listed with `node server.js --help`.

**Testing and debugging**

Start the server: `node server.js --debug`. Then, a separate terminal:

```bash
curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/mutate
```

Where `'...'` is taken as the source. Do this a couple of times until a rule can fire. See server output for debug messages.
