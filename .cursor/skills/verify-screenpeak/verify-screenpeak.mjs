#!/usr/bin/env node
// Local ScreenPeak verification harness. See SKILL.md in this directory.
import { drive } from './drives/index.mjs'
import { gatewayChild } from './gateway.mjs'
import { fail } from './runtime.mjs'
import { doctor, down, up } from './stack.mjs'

const command = process.argv[2]
if (command === 'up') await up()
else if (command === 'down') await down()
else if (command === 'doctor') await doctor()
else if (command === 'drive') await drive(process.argv[3])
else if (command === 'gateway') await gatewayChild()
else {
    fail('Usage: verify-screenpeak.mjs up|doctor|drive <feature>|down')
}
