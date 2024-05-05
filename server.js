/* eslint-env node, es6 */
const express = require('express');
const fetch = require('node-fetch');
const jsdom = require("jsdom");
const fs = require('fs');
const { JSDOM } = jsdom;
const cors = require('cors')
const app = express();
const port = parseInt(process.env.PORT || 3001);

app.use(cors())

// Constants:
const LIMIT = 19;
const USER_AGENT = 'CommonsGallery (beta)';
const ORIGIN = '*';
const IMG_WIDTH = '320';
const IMG_HEIGHT = '200';
const HEADERS = {
  'User-Agent': USER_AGENT,
  'Api-User-Agent': USER_AGENT
}
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

async function getLastRevisionIDByUser(page, username) {
  const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      titles: page,
      prop: 'revisions',
      rvprop: 'ids|user',
      rvlimit: '50',
      origin: '*'
  });

  try {
      const response = await fetch(`${COMMONS_API}?${params.toString()}`, { headers: HEADERS });
      const data = await response.json();
      const pages = data.query.pages;
      const pageId = Object.keys(pages)[0];
      const revisions = pages[pageId].revisions;
      username = username.replaceAll('_', ' ');
      const userRevision = revisions.find(rev => rev.user === username);
      if (userRevision) {
          return userRevision.revid;
      } else {
          console.error(`No revision found by user ${username}`);
          return null;
      }
  } catch (error) {
      console.error('Error fetching revisions:', error);
  }
}

async function getGalleryList(username) {
  const params = new URLSearchParams({
      action: 'query',
      list: 'allpages',
      apprefix: `${username}/CommonsGallery/`,
      apnamespace: '2',
      format: 'json',
      origin: '*'
  });

  try {
      const response = await fetch(`${COMMONS_API}?${params.toString()}`, { headers: HEADERS });
      const data = await response.json();
      const titles = data.query.allpages.map(page => page.title);
      return titles;
  } catch (error) {
      console.error('Error fetching revisions:', error);
  }
}

// Function to fetch a specific revision by ID and parse it into a DOM
async function fetchRevisionDOM(revisionId) {
  try {
    // Fetch the HTML content of the specific revision
    const params = new URLSearchParams({
      action: 'parse',
      oldid: revisionId,
      format: 'json' 
    });
    const response = await fetch(`${COMMONS_API}?${params.toString()}`, { headers: HEADERS });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Use JSDOM to convert the HTML string into a DOM object
    const html = data.parse.text['*'];
    const dom = new JSDOM(html);
    return dom.window.document;
  } catch (e) {
    console.error("Failed to fetch or parse revision:", e);
    return null;
  }
}

async function generateDOM(revisionId) {
  const htmlBase = await fs.readFileSync('base.html', 'utf8');
  const dom = new JSDOM(htmlBase, {
      resources: "usable",
      runScripts: "dangerously"
  });
  const document = dom.window.document;

  await fetchRevisionDOM(revisionId).then(dom => {
    let images = [];
    
    dom.querySelectorAll('ul.gallery, p, h2, ul').forEach((el) => {
      const resultGrid = document.createElement('div');
      resultGrid.className = 'resultsGrid';

      if (el.classList.contains('gallery')) {
        el.querySelectorAll('a.mw-file-description').forEach((link) => {
          data = {
            link: 'https://commons.wikimedia.org' + link.href,
            img: link.querySelector('img').src.replace(/\/\d+px/g, "/400px")
          };
          images.push(data);
          const imageContainer = document.createElement('div');
          imageContainer.classList.add('imageContainer');
          const anchor = document.createElement('a');
          anchor.href = data.link;
          const img = document.createElement('img');
          img.src = data.img;
          anchor.append(img);
          imageContainer.append(anchor);
          const caption = document.createElement('div');
          caption.classList.add('caption');
          caption.classList.add('caption-bottom');
          caption.textContent = link.title;
          imageContainer.append(caption);
          resultGrid.append(imageContainer);
        });
      } else if (el.nodeName === 'UL') {
        el.querySelectorAll('li a').forEach((link) => {
          const anchor = document.createElement('a');
          let [, username, path] = link.href.match(/User:([^/]+)\/CommonsGallery\/(.*)/);
          anchor.href = `/u/${username}/${path}`;
          const button = document.createElement('button');
          button.textContent = link.textContent;
          anchor.append(button);
          resultGrid.append(anchor);
        });
      } else if (el.nodeName === 'H2') {
        const header = document.createElement('h2');
        header.textContent = el.querySelector('span.mw-headline').textContent;
        resultGrid.append(header);
      } else if (el.nodeName === 'P') {
        resultGrid.innerHTML = el.innerHTML;
      }
      document.querySelector('#results').append(resultGrid);
    });
  });

  return dom.serialize();
}

app.get('/u/:username', async (req, res) => {
  const username = req.params.username;
  const revisionId = await getLastRevisionIDByUser(('User:' + username + '/CommonsGallery').replaceAll('_', ' '), username);
  const serializedDOM = await generateDOM(revisionId);

  res.send(serializedDOM);
});

app.get('/u/:username/*', async (req, res) => {
  const username = req.params.username;
  const path = req.params[0];
  const revisionId = await getLastRevisionIDByUser(('User:' + username + '/CommonsGallery/' + path).replaceAll('_', ' '), username);
  const serializedDOM = await generateDOM(revisionId);

  res.send(serializedDOM);
});

// Serve static pages in static directory:
app.use(express.static('static'));

app.listen(port, () => console.log(`Listening at port ${port}`));

