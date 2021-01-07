#!/bin/bash

git clone https://github.com/ethereum/solidity

rm -rf sources
mkdir -p sources
find solidity/test/libsolidity/syntaxTests -name "*.sol" -exec cp -n {} sources \;
