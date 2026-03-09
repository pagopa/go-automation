#!/bin/bash

# Installazione dipendenze
pnpm install

# Build della libreria comune
pnpm build:common

# Build degli scripts
pnpm build:scripts