#!/bin/env bash
(
    git clone https://github.com/neurobin/shc
    cd shc
    ./configure
    make
    make install
)
