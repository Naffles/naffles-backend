const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Session = require('../models/utils/session');

// Apply the stealth plugin once
puppeteer.use(StealthPlugin());

// Utility function for random delay
function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));
}

// Utility function for human-like mouse movement
async function humanLikeMouseMove(page, destination) {
  const { x: startX, y: startY } = await page.evaluate(() => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight
  }));

  const steps = 25;
  const deltaX = (destination.x - startX) / steps;
  const deltaY = (destination.y - startY) / steps;

  for (let i = 0; i < steps; i++) {
    await page.mouse.move(startX + deltaX * i, startY + deltaY * i);
    await randomDelay(50, 150);
  }
}

// Function to detect if CAPTCHA is present
// still need to edit, not working
async function detectCaptcha(page) {
  const captchaDetected = await page.evaluate(() => {
    return document.querySelector('iframe[src*="captcha"]') !== null ||
      document.body.innerText.includes("Enter the characters you see");
  });
  return captchaDetected;
}

// Function to check if session is still valid
async function isSessionValid(page) {
  try {
    await page.goto('https://x.com/home', { waitUntil: 'networkidle2' });

    // Simulate human-like mouse movement to the profile area
    const profilePosition = await page.$eval('a[aria-label="Profile"]', el => {
      const { x, y } = el.getBoundingClientRect();
      return { x, y };
    });
    await humanLikeMouseMove(page, profilePosition);

    const isLoggedIn = await page.evaluate(() => {
      return document.querySelector('a[aria-label="Profile"]') !== null;
    });

    return isLoggedIn;
  } catch (error) {
    console.error("Error while verifying session:", error.message);
    return false;
  }
}

async function createPuppeteerPage(username, password) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Set a random User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36'
    );

    let loggedIn = true;
    // Load existing session from MongoDB if available
    const sessionData = await Session.findOne({ key: 'twitter-session' });
    if (sessionData) {

      const { cookies, localStorage } = sessionData;
      const sanitizedCookies = cookies.map(({ name, value, domain, path, expires, size, httpOnly, secure, sameSite }) => ({
        name,
        value,
        domain,
        path,
        expires,
        httpOnly,
        secure,
        sameSite,
      }));
      await page.setCookie(...sanitizedCookies);
      // await page.evaluateOnNewDocument(storage => {
      //   localStorage.clear();
      //   for (let key in storage) {
      //     localStorage.setItem(key, storage[key]);
      //   }
      // }, localStorage);
      // // loggedIn = await isSessionValid(page);
    }

    if (!loggedIn) {
      throw new Error("Session Invalid")
      // // Log in to Twitter if no session is found
      // await page.goto('https://twitter.com/login', { waitUntil: 'networkidle2' });
      // await page.waitForSelector('input[name="text"]', { visible: true });

      // // Random delays and human-like typing
      // await randomDelay(100, 1000);
      // await page.type('input[name="text"]', username, { delay: Math.floor(Math.random() * 100) + 50 });
      // // Press Enter after typing the username
      // await randomDelay(100, 300);
      // await page.keyboard.press('Enter');

      // // Wait for the password input field and enter the password
      // await page.waitForSelector('input[name="password"]', { visible: true });
      // await randomDelay(100, 1000);
      // await page.type('input[name="password"]', password, { delay: Math.floor(Math.random() * 100) + 50 });
      // await page.keyboard.press('Enter');
      // // Wait for login to complete
      // await page.waitForNavigation({ waitUntil: 'networkidle2' });

      // // Check for CAPTCHA after attempting login
      // if (await detectCaptcha(page)) {
      //   throw new Error("CAPTCHA detected. Manual intervention required.");
      // }
      // // Save session data to MongoDB
      // const cookies = await page.cookies();
      // const localStorage = await page.evaluate(() => {
      //   let data = {};
      //   for (let i = 0; i < localStorage.length; i++) {
      //     const key = localStorage.key(i);
      //     data[key] = localStorage.getItem(key);
      //   }
      //   return data;
      // });

      // await Session.updateOne(
      //   { key: 'twitter-session' },
      //   { $set: { cookies, localStorage, updatedAt: new Date() } },
      //   { upsert: true }
      // );
    }
    return { browser, page };

  } catch (error) {
    console.error("Error in createPuppeteerPage123:", error.message);
    if (browser) await browser.close();
    return { error: error.message };
  }
}

// no login required
async function createBasicPuppeteerPage() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();

    // Simulate some page scrolling
    await randomDelay(200, 2000);
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight / 2);
    });

    return { browser, page };
  } catch (error) {
    console.error("Error in createPuppeteerPage:", error.message);
    if (browser) await browser.close();
    return { error: error.message };
  }
}

/**
 * Function to extract the tweet ID from a given tweet URL.
 * @param {string} tweetUrl - The URL of the tweet.
 * @returns {string | null} - Returns the tweet ID if found, otherwise null.
 */
const extractTweetId = (tweetUrl) => {
  try {
    const url = new URL(tweetUrl);
    const pathSegments = url.pathname.split('/');

    // Check if the URL follows the expected pattern (e.g., /username/status/tweetId)
    const tweetIdIndex = pathSegments.findIndex(segment => segment === 'status') + 1;

    if (tweetIdIndex && pathSegments[tweetIdIndex]) {
      return pathSegments[tweetIdIndex];
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error extracting tweet ID:", error);
    return null;
  }
};

module.exports = {
  createPuppeteerPage,
  createBasicPuppeteerPage,
  extractTweetId
};
