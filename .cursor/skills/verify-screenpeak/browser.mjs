// Headless Chrome over the DevTools protocol, and the page helpers drives use.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { runDir } from './config.mjs'
import { spawnLogged, stopRecorded } from './runtime.mjs'

export async function launchChrome() {
    const dataDir = join(runDir, 'chrome-profile')
    await rm(dataDir, { recursive: true, force: true })
    await mkdir(dataDir, { recursive: true })
    return spawnLogged('chrome', 'google-chrome', [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--window-size=1280,800',
        `--remote-debugging-port=9222`,
        `--user-data-dir=${dataDir}`,
        'about:blank',
    ], {})
}

export async function connectChrome() {
    let list = []
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            const response = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
            if (response.ok) {
                list = [await response.json()]
                break
            }
        } catch { /* chrome still starting */ }
        try {
            const response = await fetch('http://127.0.0.1:9222/json/list')
            const pages = await response.json()
            if (pages.length) {
                list = pages
                break
            }
        } catch { /* not up */ }
        await new Promise((resolve) => setTimeout(resolve, 250))
    }
    if (!list[0]?.webSocketDebuggerUrl) throw new Error('Chrome DevTools did not open a page.')
    const ws = new WebSocket(list[0].webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve, { once: true })
        ws.addEventListener('error', reject, { once: true })
    })
    let nextId = 0
    const pending = new Map()
    const events = []
    ws.addEventListener('message', (event) => {
        const message = JSON.parse(event.data)
        if (message.id && pending.has(message.id)) {
            const waiter = pending.get(message.id)
            pending.delete(message.id)
            if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
            else waiter.resolve(message.result)
        } else if (message.method) {
            events.push(message)
        }
    })
    function send(method, params = {}) {
        const id = ++nextId
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject })
            ws.send(JSON.stringify({ id, method, params }))
        })
    }
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Network.enable')
    const loadoutCapture = { status: null, body: null }
    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
        }
        return result.result?.value
    }
    async function navigate(url) {
        await send('Page.navigate', { url })
        await new Promise((resolve) => setTimeout(resolve, 300))
        const started = Date.now()
        while (Date.now() - started < 20_000) {
            const ready = await evaluate('document.readyState')
            if (ready === 'complete') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error(`Navigation to ${url} did not finish`)
    }
    async function bodyText() {
        return evaluate('document.body ? document.body.innerText : ""')
    }
    async function waitForText(needle, timeoutMs = 20_000) {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            const text = await bodyText()
            if (text.includes(needle)) return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting for ${JSON.stringify(needle)}. Page text:\n${text.slice(0, 1200)}`)
    }
    async function waitForTextEither(needles, timeoutMs) {
        const started = Date.now()
        while (Date.now() - started < timeoutMs) {
            const text = await bodyText()
            if (needles.some((needle) => text.includes(needle))) return
            await new Promise((resolve) => setTimeout(resolve, 250))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting for one of ${needles.join(' | ')}.\n${text.slice(0, 1200)}`)
    }
    async function clickButton(name) {
        const outcome = await evaluate(`(() => {
            const buttons = [...document.querySelectorAll('button')]
            const visible = buttons.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : buttons
            const button = pool.find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click button ${name}`)
    }
    async function clickTab(name) {
        const outcome = await evaluate(`(() => {
            const button = [...document.querySelectorAll('[role="tab"]')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click tab ${name}`)
    }
    async function clickControl(name) {
        const outcome = await evaluate(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click ${name}`)
    }
    async function panelText() {
        return evaluate(`(() => {
            const panel = document.querySelector('[role="tabpanel"][data-state="active"]')
            const root = panel || document.body
            return root.innerText || ''
        })()`)
    }
    async function controlInView(name) {
        return evaluate(`(() => {
            const root = document.querySelector('[role="tabpanel"][data-state="active"]') || document.body
            const nodes = [...root.querySelectorAll('button, [role="button"]')]
            return nodes.some((item) => item.textContent.trim() === ${JSON.stringify(name)}) ? 'yes' : 'no'
        })()`)
    }
    function eventMark() {
        return events.length
    }
    function requestUrlsSince(index) {
        return events.slice(index)
            .filter((item) => item.method === 'Network.requestWillBeSent')
            .map((item) => String(item.params?.request?.url || ''))
    }
    async function clickDialogButton(name) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            if (!dialog) return 'no-dialog'
            const button = [...dialog.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!button) return 'missing'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click dialog button ${name} (${outcome})`)
    }
    async function clickLink(name) {
        const outcome = await evaluate(`(() => {
            const link = [...document.querySelectorAll('a')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
            if (!link) return 'missing'
            link.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click link ${name}`)
    }
    async function clickSectionButton(heading) {
        const outcome = await evaluate(`(() => {
            const match = [...document.querySelectorAll('b')].find((item) => item.textContent.trim() === ${JSON.stringify(heading)})
            if (!match) return 'no-heading'
            const button = match.parentElement && match.parentElement.querySelector('button')
            if (!button) return 'no-button'
            button.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click the button in ${heading} (${outcome})`)
    }
    async function clickPlaceholder(placeholder) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const input = (dialog || document).querySelector(${JSON.stringify(`input[placeholder="${placeholder}"]`)})
            if (!input) return 'missing'
            input.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click ${placeholder} (${outcome})`)
    }
    async function waitUntil(expression, timeoutMs = 20_000) {
        const started = Date.now()
        let last = ''
        while (Date.now() - started < timeoutMs) {
            last = await evaluate(expression)
            if (last === 'ok') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        const text = await bodyText()
        throw new Error(`Timed out waiting (${last}). Page text:\n${text.slice(0, 1200)}`)
    }
    async function clickMenuLink(name) {
        const started = Date.now()
        while (Date.now() - started < 8_000) {
            const outcome = await evaluate(`(() => {
                const menu = document.querySelector('[role="menu"]')
                if (!menu) return 'no-menu'
                const link = [...menu.querySelectorAll('a')].find((item) => item.textContent.trim() === ${JSON.stringify(name)})
                if (!link) return 'missing'
                link.click()
                return 'clicked'
            })()`)
            if (outcome === 'clicked') return
            await new Promise((resolve) => setTimeout(resolve, 200))
        }
        throw new Error(`Could not click menu link ${name}`)
    }
    async function setViewport(width, height) {
        await send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 2,
            mobile: true,
        })
    }
    async function clickLabel(name) {
        const outcome = await evaluate(`(() => {
            const nodes = [...document.querySelectorAll('button, [role="button"], a, [role="link"]')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const pool = visible.length ? visible : nodes
            const node = pool.find((item) => (item.getAttribute('aria-label') || '').trim() === ${JSON.stringify(name)})
            if (!node) return 'missing'
            node.click()
            return 'clicked'
        })()`)
        if (outcome !== 'clicked') throw new Error(`Could not click label ${name}`)
    }
    async function fillLabel(label, value) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const root = dialog || document
            const nodes = [...root.querySelectorAll('input, textarea')]
            const visible = nodes.filter((item) => item.getClientRects().length > 0)
            const field = (visible.length ? visible : nodes).find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)})
            if (!field) return 'missing'
            const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
            setter.call(field, ${JSON.stringify(value)})
            field.dispatchEvent(new Event('input', { bubbles: true }))
            field.dispatchEvent(new Event('change', { bubbles: true }))
            return field.value
        })()`)
        if (outcome !== value) throw new Error(`Could not fill ${label} (${outcome})`)
    }
    function requestsSince(index) {
        return events.slice(index)
            .filter((item) => item.method === 'Network.requestWillBeSent')
            .map((item) => ({
                url: String(item.params?.request?.url || ''),
                method: String(item.params?.request?.method || ''),
                body: String(item.params?.request?.postData || ''),
            }))
    }
    async function fillPlaceholder(placeholder, value) {
        const outcome = await evaluate(`(() => {
            const dialog = document.querySelector('[role="dialog"]')
            const root = dialog || document
            const inputs = [...root.querySelectorAll(${JSON.stringify(`input[placeholder="${placeholder}"]`)})]
            const visible = inputs.filter((item) => item.getClientRects().length > 0)
            const input = (visible.length ? visible : inputs)[0]
            if (!input) return 'missing'
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
            setter.call(input, ${JSON.stringify(value)})
            input.dispatchEvent(new Event('input', { bubbles: true }))
            input.dispatchEvent(new Event('change', { bubbles: true }))
            return input.value
        })()`)
        if (outcome !== value) throw new Error(`Could not fill ${placeholder} (${outcome})`)
    }
    async function screenshot(path) {
        const shot = await send('Page.captureScreenshot', { format: 'png' })
        await writeFile(path, Buffer.from(shot.data, 'base64'))
    }
    let captureTimer = null
    let captureWatchdog = null
    function stopLoadoutCapture() {
        if (captureTimer) clearInterval(captureTimer)
        if (captureWatchdog) clearTimeout(captureWatchdog)
        captureTimer = null
        captureWatchdog = null
    }
    function armLoadoutCapture() {
        stopLoadoutCapture()
        captureTimer = setInterval(async () => {
            const event = events.find((item) => item.method === 'Network.responseReceived' && String(item.params?.response?.url || '').includes('/api/loadout'))
            if (!event || loadoutCapture.status) return
            loadoutCapture.status = event.params.response.status
            try {
                const body = await send('Network.getResponseBody', { requestId: event.params.requestId })
                loadoutCapture.body = body.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body.body
            } catch (error) {
                loadoutCapture.body = error instanceof Error ? error.message : String(error)
            }
            stopLoadoutCapture()
        }, 200)
        captureWatchdog = setTimeout(() => stopLoadoutCapture(), 90_000)
    }
    function close() {
        stopLoadoutCapture()
        ws.close()
    }
    async function ariaLabels() {
        return evaluate(`(() => [...document.querySelectorAll('[aria-label]')].map((node) => node.getAttribute('aria-label') || '').join('\\n'))()`)
    }
    async function readoutParagraph() {
        return evaluate(`(() => {
            const node = document.querySelector('p.italic')
            return node ? node.textContent.trim().replace(/^“|”$/g, '') : ''
        })()`)
    }
    return {
        navigate, waitForText, waitForTextEither, waitUntil, clickButton, clickTab, clickControl, clickDialogButton, clickLink, clickMenuLink,
        clickSectionButton, clickPlaceholder, fillPlaceholder, clickLabel, fillLabel, setViewport, screenshot, bodyText, panelText, controlInView,
        eventMark, requestUrlsSince, requestsSince, evaluate, ariaLabels, armLoadoutCapture, loadoutCapture, readoutParagraph, close,
    }
}

export function stopChrome(chromePid) {
    stopRecorded('chrome')
    if (chromePid) {
        try { process.kill(chromePid, 'SIGTERM') } catch { /* already stopped */ }
    }
}
