var express = require('express');
var bodyParser = require('body-parser');
var app = express();

var url = require('url');
const { match, rewrite, substitute } = require("./js/comby.js")

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

app.post('/rewrite', bodyParser.json, function (req, res) {
      var mutation = rules[Math.floor(Math.random() * rules.length)];
      var result = rewrite(req.body.source, req.body.match, req.body.rewrite, ".go", "where true");
      // console.log('Result: ', result);
      res.send(result);
   })

function replaceRange(source, {start, end}, replacement_text) {
   var before = source.slice(0, start.offset);
   var after = source.slice(end.offset, source.length);
   return before + replacement_text + after
}   

app.post('/mutate', function (req, res) {
   var mutation = rules[Math.floor(Math.random() * rules.length)];
   try {
      var unparsed = match(req.body, mutation.match, '.go', 'where true');
   } catch (err) { // Suppress bizarre Invalid_argument issue.
      res.send('');
      return;
   }
   var matches = JSON.parse(unparsed);
   if (matches.length > 0) {
      var index = Math.floor(Math.random() * matches.length);
      var m = matches[index];
      var substituted = substitute(mutation.rewrite, JSON.stringify(m.environment));
      var result = replaceRange(req.body, m.range, substituted);
      res.send(result);
      return;
   }
   res.send('');
})

/**
 * Same as /mutate endpoint but with debugging messages. Invoke with, e.g.,
 *  
 * curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/mutate_debug
 */
app.post('/mutate_debug', function (req, res) {
   console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-')
   console.log('Got request: ', req.body)
   var mutation = rules[Math.floor(Math.random() * rules.length)];
   console.log('Picked mutation: ', mutation)
   var matches = JSON.parse(match(req.body, mutation.match, '.go', 'where true'));
   console.log('All matches: ', matches);
   if (matches.length > 0) {
      var index = Math.floor(Math.random() * matches.length);
      var m = matches[index];
      console.log('Picked match: ', index);
      console.log('Substituting: ', JSON.stringify(m.environment));
      var substituted = substitute(mutation.rewrite, JSON.stringify(m.environment));
      console.log('Substituted for mutation: ', substituted);
      var result = replaceRange(req.body, m.range, substituted);
      console.log('Result: ', result);
      console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-');
      res.send(result);
      return;
   }
   console.log('-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-')
   res.send('');
})

var server = app.listen(4448, function () {
   var host = server.address().address
   var port = server.address().port
   
   console.log("Mutation server listening at http://%s:%s", host, port)
})
