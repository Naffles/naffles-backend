const puppeteer = require('puppeteer');
const Session = require('../models/utils/session');
const connectWithRetry = require('../config/database');

/**
 * Function to create a Puppeteer page and attempt to log in to Twitter with a visible browser window.
 * @param {string} username - Twitter username.
 * @param {string} password - Twitter password.
 * @returns {Promise<{ browser: Object, page: Object }>} - Returns an object with the browser and page.
 */
async function createVisiblePuppeteerPage(username, password) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false, // Set to false to see the browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const page = await browser.newPage();

    // Set a random User-Agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.102 Safari/537.36'
    );

    // Log in to Twitter
    await page.goto('https://x.com/login', { waitUntil: 'networkidle2' });
    console.log("Navigated to Twitter login page.");

    // Wait for the username input field and enter the username
    await page.waitForSelector('input[name="text"]', { visible: true });
    await page.type('input[name="text"]', username, { delay: 100 });

    // Press Enter after typing the username
    await page.keyboard.press('Enter');
    // await page.waitForTimeout(2000); // Wait for the next step to load

    // Wait for the password input field and enter the password
    await page.waitForSelector('input[name="password"]', { visible: true });
    await page.type('input[name="password"]', password, { delay: 100 });

    // Press Enter after typing the password
    await page.keyboard.press('Enter');

    // Wait for the navigation to complete
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    console.log("Login process completed.");

    const cookies = await page.cookies();
    console.log("COOKIES: ", cookies);

    // Extract Bearer Token from network requests
    let bearerToken = null;
    page.on('response', async (response) => {
      if (response.url().includes('/graphql/')) { // Adjust this to match Twitter's API request URLs
        const authHeader = response.request().headers()['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          bearerToken = authHeader.split(' ')[1];
          // for now this is ok
          // but it needs to manually input the bearer token in DB
          console.log("Bearer Token found:", bearerToken);
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 3 * 1000));

    const localStorage = await page.evaluate(() => {
      let data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });

    await Session.updateOne(
      { key: 'twitter-session-test2' },
      { $set: { cookies, localStorage, updatedAt: new Date() } },
      { upsert: true }
    );
    return { browser, page };

  } catch (error) {
    console.error("Error in createVisiblePuppeteerPage:", error.message);
    if (browser) await browser.close();
    return { error: error.message };
  }
}

// Example usage
(async () => {
  connectWithRetry();
  const username = 'penguliath';
  const password = 'TC10ckwise';
  const { browser, page } = await createVisiblePuppeteerPage(username, password);

  if (browser && page) {
    console.log("Browser and page created successfully. You can now manually inspect the browser.");
    // Keep browser open for 100 seconds to observe the behavior
    await new Promise(resolve => setTimeout(resolve, 100 * 1000));
    // await browser.close();
  }
})();
