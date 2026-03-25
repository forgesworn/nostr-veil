// Cursor overlay using data URI background-image (reliable in Playwright video capture)

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 3l14 9-6 2-4 7z" fill="%23f59e0b" stroke="%23000" stroke-width="1"/></svg>`

export async function injectCursor(page) {
  await page.evaluate((svg) => {
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.style.cssText = `
      position: fixed; top: 0; left: 0; width: 24px; height: 24px; z-index: 99999;
      pointer-events: none; transition: none;
      background-image: url("data:image/svg+xml,${svg}");
      background-size: contain; background-repeat: no-repeat;
      display: none;
    `
    document.body.appendChild(cursor)

    // Ripple element for clicks
    const ripple = document.createElement('div')
    ripple.id = 'demo-ripple'
    ripple.style.cssText = `
      position: fixed; width: 40px; height: 40px; z-index: 99998;
      pointer-events: none; border-radius: 50%;
      border: 2px solid #f59e0b; opacity: 0; transform: scale(0);
    `
    document.body.appendChild(ripple)
  }, CURSOR_SVG)
}

export async function showCursor(page) {
  await page.evaluate(() => {
    document.getElementById('demo-cursor').style.display = 'block'
  })
}

export async function hideCursor(page) {
  await page.evaluate(() => {
    document.getElementById('demo-cursor').style.display = 'none'
  })
}

export async function moveTo(page, x, y, duration = 400) {
  const steps = Math.max(10, Math.floor(duration / 16))
  const cursor = await page.$('#demo-cursor')
  const startBox = await page.evaluate(() => {
    const c = document.getElementById('demo-cursor')
    return { x: parseFloat(c.style.left) || 0, y: parseFloat(c.style.top) || 0 }
  })

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Cubic ease-in-out
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
    const cx = startBox.x + (x - startBox.x) * ease
    const cy = startBox.y + (y - startBox.y) * ease
    await page.evaluate(({ cx, cy }) => {
      const c = document.getElementById('demo-cursor')
      c.style.left = cx + 'px'
      c.style.top = cy + 'px'
    }, { cx, cy })
    await page.waitForTimeout(16)
  }
}

export async function clickElement(page, selector, { moveDuration = 400 } = {}) {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`Element not found: ${selector}`)

  const x = box.x + box.width / 2
  const y = box.y + box.height / 2

  await moveTo(page, x, y, moveDuration)

  // Ripple effect
  await page.evaluate(({ x, y }) => {
    const ripple = document.getElementById('demo-ripple')
    ripple.style.left = (x - 20) + 'px'
    ripple.style.top = (y - 20) + 'px'
    ripple.style.opacity = '0.8'
    ripple.style.transform = 'scale(1)'
    ripple.style.transition = 'all 0.3s ease-out'
    setTimeout(() => {
      ripple.style.opacity = '0'
      ripple.style.transform = 'scale(2)'
      setTimeout(() => { ripple.style.transition = 'none'; ripple.style.transform = 'scale(0)' }, 300)
    }, 100)
  }, { x, y })

  await page.click(selector)
  await page.waitForTimeout(200)
}

export async function pause(page, ms) {
  await page.waitForTimeout(ms)
}
