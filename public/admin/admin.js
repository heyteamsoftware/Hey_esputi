// Panel de administración de Esputi: lista y borra usuarios.
(function () {
  var API = '/esputi/api/admin.php'
  var $ = function (id) { return document.getElementById(id) }
  var users = []

  function call(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (r) {
        return r.json().catch(function () { return {} }).then(function (j) {
          if (!r.ok) { var e = new Error(j.error || 'Error del servidor'); e.status = r.status; throw e }
          return j
        })
      })
  }

  function fmt(iso) {
    if (!iso) return '—'
    var d = new Date(iso)
    return isNaN(d) ? '—' : d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  }

  function show(logged) {
    $('login').hidden = logged
    $('panel').hidden = !logged
    if (!logged) $('pw').focus()
  }

  function render() {
    var q = $('filter').value.trim().toLowerCase()
    var list = users.filter(function (u) { return u.name.toLowerCase().indexOf(q) >= 0 })
    var tbody = $('rows')
    tbody.textContent = ''
    list.forEach(function (u) {
      var tr = document.createElement('tr')
      ;[u.name, u.client ? u.client + (u.seen ? ' · ' + u.seen.split('-').reverse().join('/') : '') : '—', fmt(u.created), u.liked, u.playlists, u.spotify, fmt(u.updated)].forEach(function (v) {
        var td = document.createElement('td'); td.textContent = v; tr.appendChild(td)
      })
      var td = document.createElement('td')
      var b = document.createElement('button')
      b.className = 'del'; b.type = 'button'; b.textContent = 'Borrar'
      b.setAttribute('aria-label', 'Borrar al usuario ' + u.name)
      b.addEventListener('click', function () { remove(u.name) })
      td.appendChild(b); tr.appendChild(td); tbody.appendChild(tr)
    })
    $('none').hidden = list.length > 0
  }

  function load() {
    $('panel-err').textContent = ''
    return call({ a: 'list' }).then(function (r) {
      users = r.users
      $('summary').textContent = users.length + (users.length === 1 ? ' usuario registrado' : ' usuarios registrados') + ' · ' + r.visits + ' visitas'
      show(true); render()
    }).catch(function (e) {
      if (e.status === 401) show(false); else { show(true); $('panel-err').textContent = e.message }
    })
  }

  function remove(name) {
    if (!confirm('¿Borrar al usuario «' + name + '» y todas sus listas? No se puede deshacer.')) return
    call({ a: 'delete', name: name }).then(load).catch(function (e) {
      if (e.status === 401) show(false); else $('panel-err').textContent = e.message
    })
  }

  $('login').addEventListener('submit', function (ev) {
    ev.preventDefault()
    var pw = $('pw').value
    if (!pw) { $('login-err').textContent = 'Escribe la contraseña'; return }
    $('login-err').textContent = ''
    call({ a: 'login', password: pw }).then(function () { $('pw').value = ''; return load() })
      .catch(function (e) { $('login-err').textContent = e.message })
  })
  $('logout').addEventListener('click', function () { call({ a: 'logout' }).finally(function () { users = []; show(false) }) })
  $('reload').addEventListener('click', load)
  $('filter').addEventListener('input', render)

  load()
})()
