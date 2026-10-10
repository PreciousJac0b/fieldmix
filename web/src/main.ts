import './style.css'

/** Phase 0 placeholder: shows backend health so dev.sh can be checked end to end. */
async function showHealth(el: HTMLElement): Promise<void> {
  try {
    const res = await fetch('/api/health')
    const health = await res.json()
    el.textContent = JSON.stringify(health, null, 2)
  } catch (err) {
    el.textContent = `Backend unreachable: ${String(err)}`
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <h1>Fieldmix</h1>
  <p>Phase 0 placeholder. Backend health:</p>
  <pre id="health">checking…</pre>
`
showHealth(document.querySelector<HTMLPreElement>('#health')!)
