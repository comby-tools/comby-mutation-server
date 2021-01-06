var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var app = express();
var url = require('url');
const { match, rewrite, substitute } = require("./js/comby.js")

var DEBUG = true

/** Transformation parameters */
var MAX_TRANSFORMATION_RETRIES = 16

/** Generation parameters */
var TEMPLATES_DIR = './templates'
var FRAGMENTS_DIR = './fragments'
var TEMPLATES = []
var FRAGMENTS = []
var GENERATE_PROBABILITY = 0.5
var TRANSFORM_GENERATED_PROBABILITY = 0.0

rules = [
   // delete delimited body
   { match: '{:[1]}', rewrite: '{}'},
   { match: '(:[1])', rewrite: '()'},
   { match: '[:[1]]', rewrite: '[]'},
   // delete delimiters
   { match: '{:[1]}', rewrite: ':[1]'},
   { match: '(:[1])', rewrite: ':[1]'},
   { match: '[:[1]]', rewrite: ':[1]'},
   // duplicate and sequence delimited
   { match: '{:[1]}', rewrite: '{:[1]} {:[1]}'},
   { match: '(:[1])', rewrite: '(:[1]) (:[1])'},
   { match: '[:[1]]', rewrite: '[:[1]] [:[1]]'},
   { match: '[:[x]]', rewrite: '[:[x]][:[x]]'},
   // simple block nesting
   { match: '{:[1]}', rewrite: '{:[1] {:[1]} }'},
   { match: '(:[1])', rewrite: '((:[1]) :[1])'},
   // convert space-separated to tuple
   { match: ':[x:e] :[y:e]', rewrite: '(:[x], :[y])'},
   { match: ':[x:e] :[y:e] :[z:e]', rewrite: '(:[x], :[y])'},
   { match: ':[x:e] :[y:e] :[z:e]', rewrite: '(:[x], :[y], :[z])'},
   // complex block nesting
   { match: ':[1]{:[2]} :[3]', rewrite: ':[1] {:[1] {:[2]} }:[3]'},
   { match: ':[1]{:[2]} :[3]', rewrite: ':[1] {:[1] {:[2]} :[2]}:[3]'},
   { match: '{:[1]{:[2]}:[3]}', rewrite: '{:[1] {:[1] {:[2]} }:[3]}'},
   { match: '{:[1]{:[2]}:[3]}', rewrite: '{:[1] {:[1] {:[2]} :[2] }:[3]}'},
   { match: '{:[1]{:[2]}:[3]}', rewrite: '{:[3] }'},
   { match: '{:[1]{:[2]}:[3]}', rewrite: '{:[1] {:[2]} }'},
   { match: '(:[1](:[2]):[3])', rewrite: '(:[1](:[2]))'},
   { match: '(:[1](:[2]):[3])', rewrite: '((:[2]))'},
   { match: '(:[1](:[2]):[3])', rewrite: '((:[2]):[3])'},
   // swaps
   { match: ':[1:e], :[2:e]', rewrite: ':[2], :[1]'},
   // add elements
   { match: '(:[1])', rewrite: '(:[1], :[1])'},
   // replace code with string data
   { match: ':[x:e]', rewrite: '""'},
   { match: ':[x:e]', rewrite: 'unicode"Hello 😃"'},
   // separate with comma
   { match: ':[x:e]', rewrite: ':[x], :[x]'},
   // change call-like values
   { match: ':[x:e](:[y])', rewrite: ':[x]()'},
   { match: ':[x:e](:[y])', rewrite: ':[x](:[y], :[y])'},
   { match: ':[x:e](:[1],:[2],:[3])', rewrite: ':[x](:[1], :[3])'},
   // change things around solidity keywords/syntax
   { match: ':[x:e] => :[y:e]', rewrite: ':[y] => :[x]'},
   { match: 'function :[x:e] :[stuff] {:[body]}', rewrite: 'modifier mod() {:[body]}'},
   { match: ':[x:e] :[stuff] {:[body]}', rewrite: ':[x] :[stuff] payable {:[body]}'},
   { match: ':[x:e] :[stuff] {:[body]}', rewrite: ':[x] :[stuff] payable {}'},
   { match: 'struct :[x:e] {:[body]}', rewrite: 'struct :[x]N {:[body]} '},
   { match: ':[x:e] is :[y:e]', rewrite: ':[y] is :[x]'},
   { match: ':[x:e];', rewrite: 'using L for :[x]' },
   { match: ':[x:e]{ :[y]: :[z] :[rest]}', rewrite: ':[x]{:[rest]}' },
   { match: '{ :[y] = :[z]; :[rest] }', rewrite: '{:[rest]}' },
   { match: '(:[x])', rewrite: 'returns (:[x])' },
   { match: ':[x:e].:[y:e]', rewrite: ':[x]' },
   { match: '{:[x]}', rewrite: 'unchecked {:[x]}' },
   { match: 'if (:[x])', rewrite: 'if (1)' },
   { match: 'if (([x]):[y])', rewrite: 'if (:[x])' },
   { match: 'if (([x]):[y])', rewrite: 'if ((([x]):[y]) && ([x]):[y]))' },
   { match: ':[x:e] ? :[x:e] : :[x:e]', rewrite: ':[x]' },
]

app.use(bodyParser.text());
app.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies

function replaceRange(source, {start, end}, replacement_text) {
   var before = source.slice(0, start.offset);
   var after = source.slice(end.offset, source.length);
   return before + replacement_text + after
}

/**
 * randomly select concrete fragments to populate environment, e.g.,
 *
 * [{"variable":"1","value":"hole_1"},{"variable":"2","value":"hole_2"}]
 *
 * TODO: infer number of holes?
 */
function generateEnvironment() {
   var holes = 10
   var environment = []
   var i
   for (i = 1; i < holes + 1; i++) {
      var fragmentName = FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)]
      var fragment = fs.readFileSync(`${FRAGMENTS_DIR}/${fragmentName}`, 'utf8')
      environment.push({ 'variable': i.toString(), 'value': fragment })
   }
   return environment
}

// randomly select a template, generate an environment, and substitute
function generateSource() {
   var templateName = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)]
   var template = fs.readFileSync(`${TEMPLATES_DIR}/${templateName}`, 'utf8')
   var environment = generateEnvironment()
   if (DEBUG) {
      console.log('template: ', template)
      console.log('------------------------------------------')
      console.log('environment: ', JSON.stringify(environment, null, 2))
      console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
   }
   return substitute(template, JSON.stringify(environment))
}

function transformSource(source) {
   if (DEBUG) {
      console.log('transforming: ', source)
   }

   let matches = []
   var i

   for (i = 0; i < MAX_TRANSFORMATION_RETRIES; i++) {
      var mutation = rules[Math.floor(Math.random() * rules.length)];
      try {
         var unparsed = match(source, mutation.match, '.go', 'where true');
      } catch (err) { // Suppress bizarre Invalid_argument issue.
         res.send('');
         if (DEBUG) {
            console.log('bizarre error: ', err)
         }
         continue
      }
      matches = JSON.parse(unparsed);
      if (matches.length > 0) {
         break
      }
      if (DEBUG) {
         console.log('picked mutation: ', mutation)
         console.log('retrying transformation')
      }
   }

   if (matches.length > 0) {
      var index = Math.floor(Math.random() * matches.length);
      var m = matches[index];
      var substituted = substitute(mutation.rewrite, JSON.stringify(m.environment))
      var result = replaceRange(source, m.range, substituted);
      if (DEBUG) {
         console.log('picked mutation: ', mutation)
         console.log('has matches: ', matches)
         console.log('environment: ', JSON.stringify(m.environment))
         console.log('substituted for mutation: ', substituted)
         console.log('result: ', result)
      }
      return result
   }

   if (DEBUG) {
      console.log('no mutation with matches')
   }
   return ''
}

function mutate(source) {
   if (Math.random() < GENERATE_PROBABILITY) {
      if (DEBUG) {
         console.log('generating... ')
      }
      var source = generateSource()
      if (Math.random() < TRANSFORM_GENERATED_PROBABILITY) {
         if (DEBUG) {
            console.log('and transforming...')
         }
         var transformed = transformSource(source)
         if (transformed !== '') {
            return transformed
         }
      }
      return source
   } else {
      if (DEBUG) {
         console.log('transforming... ')
      }
      return transformSource(source)
   }
}

app.post('/mutate', function (req, res) {
   res.send(mutate(req.body))
})

/** Debug endpoints. */

/**
 * Example invocation:
 *
 * curl -d '' -H "Content-Type: text/plain" -X POST http://localhost:4448/generate_debug
 */
app.post('/generate_debug', function (_, res) {
   DEBUG = true
   console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-')
   res.send(generateSource())
   DEBUG = false
})

/**
 * Example invocation:
 *
 * curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/transform_debug
 */
app.post('/transform_debug', function (req, res) {
   DEBUG = true
   console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-')
   res.send(transformSource(req.body))
   DEBUG = false
})

app.post('/mutate_debug', function (req, res) {
   DEBUG = true
   console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-')
   res.send(mutate(req.body))
   DEBUG = false
})

/** Unused currently */
app.post('/rewrite_debug', bodyParser.json, function (req, res) {
   var mutation = rules[Math.floor(Math.random() * rules.length)];
   var result = rewrite(req.body.source, req.body.match, req.body.rewrite, ".go", "where true");
   // console.log('Result: ', result);
   res.send(result);
})

var server = app.listen(4448, function () {
   var host = server.address().address
   var port = server.address().port

   TEMPLATES = fs.readdirSync(TEMPLATES_DIR)
   FRAGMENTS = fs.readdirSync(FRAGMENTS_DIR)

   console.log("Mutation server listening at http://%s:%s", host, port)
})
