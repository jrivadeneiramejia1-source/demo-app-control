/* gente.js — Panel «Personas y códigos» (solo Gerente y Jefe).
   Códigos: uno activo por rol, guardado en codigos/<CÓDIGO> = { rol, activo, por, en }. Nadie más los puede leer.
   Quien se registra escribe su código; Firebase revisa que exista, esté activo y sea de ese rol (ver firestore.rules).
   Personas: usuarios/<uid> = { nombre, correo, rol, codigo, activo }. Aquí se les cambia el rol o se pausa su acceso.
   El Gerente maneja todo; el Jefe todo menos los códigos y las personas de Gerente y de Jefe. */
(function () {
  'use strict';
  const A = () => window.App;
  const $ = id => document.getElementById(id);
  const esH = v => A().esH(v);
  const yo = () => A().S.persona;
  const esGerente = () => !!yo() && yo().rol === 'gerente';
  // Roles que puede manejar quien tiene la sesión.
  const puedeManejar = rol => esGerente() || (!!yo() && yo().rol === 'jefe' && !['gerente', 'jefe'].includes(rol));
  let ocupado = false;

  function abrir() {
    if (!yo() || !['gerente', 'jefe'].includes(yo().rol)) return;
    pintar(true);
    A().abrirHoja('shGente');
  }

  function pintar(forzar) {
    if (!forzar && $('shGente').hidden) return;
    const S = A().S, D = window.DEMO;
    if (!yo() || !['gerente', 'jefe'].includes(yo().rol)) { $('shGente').hidden = true; return; }
    if (A().cargando('codigos') || A().cargando('usuarios')) { $('genteCuerpo').innerHTML = UI.esqueleto(3); return; }
    const codigos = S.datos.codigos.filter(c => c.activo === true);
    let h = '<div class="section-label">Códigos por rol</div>';
    h += D.AREAS.map(area => {
      const roles = D.ROLES.filter(r => r.area === area);
      return `<div class="gente-area"><b class="meta">${esH(area)}</b>${roles.map(r => {
        const c = codigos.filter(x => x.rol === r.rol).sort((a, b) => String(b.en).localeCompare(String(a.en)))[0];
        const maneja = puedeManejar(r.rol);
        const botones = !maneja ? '<span class="meta">Solo el Gerente</span>'
          : c ? `<button class="btn small" type="button" data-g="copiar" data-id="${esH(c.id)}">Copiar</button><button class="btn small ghost" type="button" data-g="cambiar" data-rol="${esH(r.rol)}">Cambiar</button>`
          : `<button class="btn small primary" type="button" data-g="crear" data-rol="${esH(r.rol)}">${window.ico('mas')}Crear código</button>`;
        return `<div class="codigo-fila"><span class="cf-t"><b>${esH(r.rolTxt)}</b>${c && maneja ? `<code>${esH(c.id)}</code>` : `<span class="meta">${c ? 'Ya tiene código' : 'Sin código'}</span>`}</span><span class="row">${botones}</span></div>`;
      }).join('')}</div>`;
    }).join('');
    const gente = S.datos.usuarios.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    h += `<div class="section-label">Personas registradas (${gente.length})</div>`;
    h += gente.length ? `<div class="list">${gente.map(u => {
      const r = D.rolDe(u.rol), maneja = puedeManejar(u.rol) && u.id !== window.nube.uid();
      const opciones = D.ROLES.filter(x => puedeManejar(x.rol)).map(x => `<option value="${esH(x.rol)}"${x.rol === u.rol ? ' selected' : ''}>${esH(x.rolTxt)}</option>`).join('');
      return `<div class="card persona-reg${u.activo === true ? '' : ' pausada'}">
        <span class="card-head"><span class="card-title">${esH(u.nombre)}</span>${A().pill(u.activo === true ? (r ? r.rolTxt : u.rol) : 'Acceso pausado', u.activo === true ? 's-disco' : 's-peligro')}</span>
        <span class="meta">${esH(u.correo)}${u.en ? ' · se registró ' + esH(A().hace(u.en)) : ''}</span>
        ${maneja ? `<div class="row"><label class="sr" for="gr-${esH(u.id)}">Rol de ${esH(u.nombre)}</label><select id="gr-${esH(u.id)}" data-g="rol" data-id="${esH(u.id)}">${opciones}</select>
          <button class="btn small ${u.activo === true ? 'ghost' : 'primary'}" type="button" data-g="${u.activo === true ? 'pausar' : 'devolver'}" data-id="${esH(u.id)}">${u.activo === true ? 'Pausar acceso' : 'Devolver acceso'}</button></div>` : ''}
      </div>`;
    }).join('')}</div>` : UI.vacio('persona', 'Todavía nadie se registró', 'Crea el código de un rol, cópialo y mándaselo a la persona. Ella entra por «Mi cuenta» y crea su cuenta con ese código.');
    $('genteCuerpo').innerHTML = h;
  }

  async function hacer(fn, listo) {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); if (listo) A().toast(listo); }
    catch (e) { A().toast(window.nube.explicar(e)); }
    finally { ocupado = false; }
  }
  // Código nuevo para el rol; los viejos de ese rol se borran (dejan de servir para registrarse).
  function nuevo(rol) {
    const viejos = A().S.datos.codigos.filter(c => c.rol === rol);
    const c = window.nube.codigoNuevo(rol);
    return window.nube.lote(viejos.map(v => ['borrar', 'codigos', v.id]).concat([['set', 'codigos', c, { rol, activo: true, por: yo().nombre, en: new Date().toISOString() }]]));
  }
  async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); A().toast(`Copiado: ${texto}`); }
    catch (e) { A().toast(`Tu código es ${texto}. Cópialo a mano.`); }
  }

  $('genteCuerpo').addEventListener('click', async e => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    const g = b.dataset.g, rol = b.dataset.rol, id = b.dataset.id, D = window.DEMO;
    if (g === 'copiar') return copiar(id);
    if (g === 'crear' && puedeManejar(rol)) return hacer(() => nuevo(rol), `Listo: código de ${D.rolDe(rol).rolTxt} creado. Cópialo y mándaselo a quien corresponda.`);
    if (g === 'cambiar' && puedeManejar(rol)) {
      const ok = await A().confirmar(`¿Cambiar el código de ${D.rolDe(rol).rolTxt}?`, 'El código viejo deja de servir para registrarse. Las personas que ya entraron siguen igual.', 'Cambiar código');
      if (ok) hacer(() => nuevo(rol), 'Listo: código cambiado. El viejo ya no sirve.');
      return;
    }
    const u = A().S.datos.usuarios.find(x => x.id === id);
    if (!u || !puedeManejar(u.rol) || u.id === window.nube.uid()) return;
    if (g === 'pausar') {
      const ok = await A().confirmar(`¿Pausar el acceso de ${u.nombre}?`, 'No podrá ver ni hacer nada en la app hasta que le devuelvas el acceso.', 'Pausar acceso');
      if (ok) hacer(() => window.nube.mezclar('usuarios', u.id, { activo: false }), `Listo: acceso de ${u.nombre} pausado.`);
    }
    if (g === 'devolver') hacer(() => window.nube.mezclar('usuarios', u.id, { activo: true }), `Listo: ${u.nombre} ya puede entrar otra vez.`);
  });
  $('genteCuerpo').addEventListener('change', e => {
    const s = e.target.closest('select[data-g="rol"]'); if (!s) return;
    const u = A().S.datos.usuarios.find(x => x.id === s.dataset.id), rol = s.value;
    if (!u || !puedeManejar(u.rol) || !puedeManejar(rol) || rol === u.rol) return;
    hacer(() => window.nube.mezclar('usuarios', u.id, { rol }), `Listo: ${u.nombre} ahora es ${window.DEMO.rolDe(rol).rolTxt}.`);
  });

  window.Gente = Object.freeze({ abrir, pintar });
})();
