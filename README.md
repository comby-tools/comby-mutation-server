# README

```
npm install express body-parser @iarna/toml minimist
```
## Server example

### Add transformation rules

Put [comby config files](https://comby.dev/docs/configuration#toml-format) in `rules`. See examples there.

### Running the server

Start the server:

```
export NODE_OPTIONS="--max-old-space-size=8192"
node server.js
```

**Parameters and defaults**

```javascript
var MAX_TRANSFORMATION_RETRIES = 16; // Number of times to retry picking a transformation if one in rules does not apply.

var GENERATE_PROBABILITY = 0.5; // Chance to introduce a new generated seed, see seed generation below. Set to 0 for pure transformation, no generation.
var TRANSFORM_GENERATED_PROBABILITY = 0.0; // Chance to apply one of the transformations in rules to a newly generated seed.
```

**Testing and debugging**

In a separate terminal:

```bash
curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/mutate_debug
```

Do this a couple of times until a rule can fire. See server output for debug messages.

## Priming seed generation

**Input**

- `extract_patterns` defines patterns for structural deconstruction
- `sources` defines starting sources

**Output**

- `fragments` - concrete fragments extracted by `extract_patterns`
- `templates` - templatized sources determined by `fragments`

**Example**

```
mkdir sources
echo "(1 (2) ((3)))" > source/example.sol
./extract.sh
```

To nest deconstruction, run `./extract.sh nest`.
