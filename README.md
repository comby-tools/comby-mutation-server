# README

```
npm install express body-parser
```

## Example

Start the server:

```
export NODE_OPTIONS="--max-old-space-size=8192"
node server.js
```

In a separate terminal:

```
curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/mutate_debug
```

Do this a couple of times until a rule can fire. See server output for debug messages.

Only hardcoded mutation rules right now. Change them in `server.js`.

Print a client to `http://localhost:4448/mutate` to suppress debug output.
