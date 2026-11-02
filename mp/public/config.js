/* =============================================================
   Crimson X — config.js  (loaded first, ahead of core.js)

   WHERE THE GAME SERVER IS.

   The client used to be inseparable from the server: index.html pulled
   /socket.io/socket.io.js out of the Node process and io() connected
   same-origin. That meant a sleeping server was not a slow game, it was a
   blank white page — nothing to render, because the thing that serves the
   page is the thing that is asleep. On a free host that idles after ~15
   minutes, almost every new visitor got that.

   Splitting them fixes it. The client is static files, so it goes on a host
   that never sleeps (Cloudflare Pages, GitHub Pages, a Render static site);
   the menu is up in about a second and the practice range — which runs
   entirely in the browser — is playable immediately, while the multiplayer
   box wakes up behind it.

   MP_SERVER is where the sockets and /rooms live, '' meaning same-origin:
     - localhost          -> same-origin, so `npm start` is unchanged
     - *.onrender.com     -> same-origin, because the Node box IS serving
                             this page; works whatever the service is named
     - anywhere else      -> SERVER_URL below, the static-host case

   >>> SERVER_URL is the one line to edit if the Render service is renamed.
   ============================================================= */
const SERVER_URL = 'https://crimson-x.onrender.com';

const MP_SERVER = (() => {
  const h = location.hostname;
  const local = !h || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  /* ?server= is a dev convenience — point a local page at a running server
     on another port, which is the only way to exercise the cross-origin path
     before deploying. Honoured ONLY on a local page: on a real one a crafted
     link could otherwise aim a player's client, and the reconnect token it
     sends, at someone else's server. */
  if (local) {
    const q = new URLSearchParams(location.search).get('server');
    return q ? q.replace(/\/$/, '') : '';
  }
  if (/\.onrender\.com$/.test(h)) return '';
  return SERVER_URL;
})();

/* Every call to the game server goes through this, so there is one place
   that knows whether we are same-origin or cross-origin. */
function mpUrl(p){ return MP_SERVER + p; }
