// Myuzika ↔ AudioMass bridge.
//
// Loaded only when the parent app opens AudioMass with ?track=<id>&token=<jwt>&api=<base>.
// Renders a small floating panel ("Save", "Save As") in the top-right corner.
// Clicking either triggers AudioMass's normal MP3 encode pipeline; the
// __myuzikaIntercept hook (patched into actions.js forceDownload) catches the
// resulting Blob and POSTs it back to the Myuzika API.
//
// Save     → POST /api/tracks/{id}/replace-audio  (overwrite source track)
// Save As  → POST /api/tracks/from-edit            (clones metadata, new track)

(function () {
  'use strict';

  var qs = new URLSearchParams(window.location.search);
  var trackId = qs.get('track');
  var token   = qs.get('token');
  var apiBase = qs.get('api') || '';
  var audioUrl = qs.get('audio') || '';     // master mix
  var stemsJson = qs.get('stems'); // JSON array: [{name, url}, …]

  if (!trackId || !token) return; // nothing to bridge, behave as vanilla AudioMass

  // Wait for AudioMass' MultiTrack subsystem to come up, then force it ON.
  // Resolves with the multitrack instance.
  function withMultitrack() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function tick() {
        var editor = window.PKAudioEditor;
        var mt = editor && editor.multitrack;
        if (mt && mt.Toggle && mt.IsOn && mt.AddFilesAuto) {
          if (!mt.IsOn()) mt.Toggle(true);
          resolve(mt);
          return;
        }
        if (++tries > 200) { resolve(null); return; } // ~20 s max
        setTimeout(tick, 100);
      })();
    });
  }

  // Fetch one or more {name, url} entries and turn them into File objects
  // AudioMass' AddFilesAuto can decode.
  function fetchAsFiles(entries) {
    return Promise.all(entries.map(function (s) {
      return fetch(s.url).then(function (r) {
        if (!r.ok) throw new Error('fetch ' + s.name + ': ' + r.status);
        return r.blob();
      }).then(function (blob) {
        var ext = (blob.type && blob.type.indexOf('wav') !== -1) ? '.wav' : '.mp3';
        return new File([blob], (s.name || 'audio') + ext, { type: blob.type || 'audio/mpeg' });
      });
    }));
  }

  // Tracks which stem names already live in the session so postMessage
  // refreshes don't duplicate them.
  var loadedStems = Object.create(null);

  function addToMultitrack(entries) {
    if (!Array.isArray(entries) || !entries.length) return;
    var fresh = entries.filter(function (s) { return !loadedStems[s.name]; });
    if (!fresh.length) return;
    withMultitrack().then(function (mt) {
      if (!mt) return;
      fresh.forEach(function (s) { loadedStems[s.name] = true; });
      return fetchAsFiles(fresh).then(function (files) {
        mt.AddFilesAuto(files);
      });
    }).catch(function (e) { console.error('multitrack load failed', e); });
  }

  // 1) On open, ALWAYS start in MultiTrack mode and load the master mix as
  //    channel 1, regardless of whether stems are ready yet.
  if (audioUrl) {
    addToMultitrack([{ name: 'mix', url: audioUrl }]);
  } else {
    // No audio param but track param: just force MultiTrack on.
    withMultitrack();
  }

  // 2) Inline (cached) path — stems already known when the tab opens. They
  //    get added as channels 2-N next to the mix.
  if (stemsJson) {
    var parsed;
    try { parsed = JSON.parse(stemsJson); } catch (_e) { parsed = null; }
    if (Array.isArray(parsed) && parsed.length) addToMultitrack(parsed);
  }

  // 3) Late-arrival path — opener tab postMessages stems after Demucs
  //    finishes. They append next to the existing mix channel.
  window.addEventListener('message', function (ev) {
    var d = ev && ev.data;
    if (!d || d.type !== 'myuzika:stems-ready') return;
    if (Array.isArray(d.stems) && d.stems.length) addToMultitrack(d.stems);
  });

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'style') Object.assign(n.style, attrs[k]);
      else if (k === 'onclick') n.onclick = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function toast(msg, isError) {
    var t = el('div', {
      style: {
        position: 'fixed', bottom: '20px', left: '50%',
        transform: 'translateX(-50%)', zIndex: 99999,
        background: isError ? '#dc2626' : '#16a34a', color: '#fff',
        padding: '10px 18px', borderRadius: '10px',
        fontFamily: 'sans-serif', fontSize: '13px',
        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
      },
    }, [msg]);
    document.body.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity 0.4s'; }, 2200);
    setTimeout(function () { t.remove(); }, 2800);
  }

  // Upload the rendered MP3 blob to one of the two endpoints. Returns the
  // server's JSON.
  function uploadBlob(blob, asNew) {
    var url = asNew
      ? apiBase + '/api/tracks/from-edit'
      : apiBase + '/api/tracks/' + encodeURIComponent(trackId) + '/replace-audio';
    var fd = new FormData();
    fd.append('file', blob, asNew ? ('edit_of_' + trackId + '.mp3') : (trackId + '.mp3'));
    if (asNew) fd.append('sourceTrackId', String(trackId));
    return fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: fd,
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(r.status + ': ' + t); });
      return r.json();
    });
  }

  // Kick the AudioMass MP3 encoder via the public engine.DownloadFile API,
  // capturing the blob via __myuzikaIntercept. We set the hook FIRST so it
  // fires when the worker finishes (encoder writes through forceDownload).
  function exportAndSend(asNew) {
    var engine = window.PKAudioEditor && window.PKAudioEditor.engine;
    if (!engine || !engine.DownloadFile) {
      toast('AudioMass not ready — try again in a second', true);
      return;
    }
    var btn = panel.querySelector('button.myuzika-busy-trigger');
    if (btn) {
      btn.disabled = true;
      btn.textContent = asNew ? 'Saving as new…' : 'Saving…';
    }
    panel.style.opacity = '0.65';

    window.__myuzikaIntercept = function (blob) {
      return uploadBlob(blob, asNew)
        .then(function (resp) {
          toast(asNew
            ? ('Saved as new track #' + (resp.trackId || '?'))
            : 'Track audio replaced');
          // Tell the opener (parent tab) to refresh + (for Save As) optionally
          // navigate to the new track.
          if (window.opener) {
            try {
              window.opener.postMessage({
                type: 'myuzika:audiomass-saved',
                asNew: asNew,
                trackId: asNew ? resp.trackId : Number(trackId),
                audioUrl: resp.audioUrl || null,
              }, '*');
            } catch (e) { /* opener gone, fine */ }
          }
        })
        .catch(function (e) {
          console.error('save failed', e);
          toast('Save failed: ' + (e.message || e), true);
        })
        .finally(function () {
          panel.style.opacity = '1';
          if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label; }
        });
    };

    // 192 kbps MP3, whole file, stereo when source is stereo, 16-bit.
    engine.DownloadFile(null, 'mp3', 192, false, true, 16, false);
  }

  function makeBtn(label, asNew, primary) {
    var b = el('button', {
      class: 'myuzika-busy-trigger',
      style: {
        background: primary ? '#ec4899' : '#27272a',
        color: '#fff', border: '1px solid ' + (primary ? '#f472b6' : '#3f3f46'),
        padding: '8px 14px', borderRadius: '10px',
        fontFamily: 'sans-serif', fontSize: '12px',
        fontWeight: '600', cursor: 'pointer',
      },
      onclick: function () { exportAndSend(asNew); },
    }, [label]);
    b.dataset.label = label;
    return b;
  }

  // Bottom-right so we don't sit on top of AudioMass' MultiTrack toggle in
  // the top-right header. Compact + draggable on mobile-ish widths.
  var panel = el('div', {
    style: {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 99998,
      background: 'rgba(20,20,23,0.92)', backdropFilter: 'blur(8px)',
      padding: '10px 12px', borderRadius: '14px',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', gap: '8px', alignItems: 'center',
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
    },
  }, [
    el('span', {
      style: { color: '#a1a1aa', fontFamily: 'sans-serif', fontSize: '11px', marginRight: '4px' },
    }, ['Myuzika - AudioEditor']),
    makeBtn('Save', false, true),
    makeBtn('Save As', true, false),
  ]);

  function attach() {
    if (document.body) document.body.appendChild(panel);
    else setTimeout(attach, 50);
  }
  attach();
})();
