// Investor Dashboard (estático)
// Carga manifest y datos por tenant. Renderiza KPIs, mapa, tarjetas y timeline.
(function(){
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const fmt = new Intl.NumberFormat('es-MX');
  const todayYear = new Date().getFullYear();
  $("#year").textContent = String(todayYear);

  const DEFAULT_CENTER = [23.6345, -102.5528]; // México
  let map, markers = [];

  async function loadJSON(path){
    const res = await fetch(path, {cache: 'no-store'});
    if(!res.ok) throw new Error(`No se pudo cargar ${path}`);
    return res.json();
  }

  function parseDate(s){
    if(!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function formatDate(s){
    const d = parseDate(s);
    if(!d) return "—";
    return d.toLocaleDateString('es-MX', {year:'numeric', month:'short', day:'2-digit'});
  }

  function daysAdd(start, days){
    if(!start || !days) return null;
    const d = parseDate(start);
    if(!d) return null;
    const out = new Date(d.getTime());
    out.setDate(out.getDate() + Number(days));
    return out.toISOString().slice(0,10);
  }

  function sumCapacity(arr){
    // Guardar contra valores nulos o indefinidos para evitar errores de ejecución
    // cuando no existan proyectos o la propiedad aún no esté definida.
    return (arr || []).reduce((acc, p) => acc + (Number(p.size_kwp||0)), 0);
  }

  function estimatePanels(size_kwp, watt_per_panel){
    if(!size_kwp || !watt_per_panel) return 0;
    const w = size_kwp * 1000;
    return Math.round(w / watt_per_panel);
  }

  function renderKPIs(tenant){
    const projects = tenant.projects || [];
    // Detectamos si es esquema de Construcción (generic) vs Solar (kWp)
    const isConstruction = projects.some(p => p.budget !== undefined);

    if (isConstruction) {
      const totalBudget = projects.reduce((acc, p) => acc + (p.budget || 0), 0);
      const totalProjects = projects.length;
      const activeProjects = projects.filter(p => p.status === 'active' || p.status === 'in_progress').length;

      $("#kpis").innerHTML = `
        <div class="kpi"><h4>Presupuesto Total</h4><p>$${fmt.format(totalBudget)}</p></div>
        <div class="kpi"><h4>Proyectos Totales</h4><p>${fmt.format(totalProjects)}</p></div>
        <div class="kpi"><h4>Proyectos Activos</h4><p>${fmt.format(activeProjects)}</p></div>
      `;
      return;
    }

    // Lógica Solar Original
    const totalCap = sumCapacity(tenant.projects) + sumCapacity(tenant.sociality);
    const totalProjects = (tenant.projects?.length||0) + (tenant.sociality?.length||0);
    const wpp = tenant.panel_specs?.watt_per_panel || 550;
    const totalPanels = (tenant.projects||[]).reduce((a,p)=>a+estimatePanels(p.size_kwp,wpp),0)
                      + (tenant.sociality||[]).reduce((a,p)=>a+estimatePanels(p.size_kwp,wpp),0);
    const avgProgress = computePortfolioProgress(tenant);

    $("#kpis").innerHTML = `
      <div class="kpi"><h4>Capacidad total</h4><p>${fmt.format(totalCap)} kWp</p></div>
      <div class="kpi"><h4>Proyectos totales</h4><p>${fmt.format(totalProjects)}</p></div>
      <div class="kpi"><h4>Paneles estimados</h4><p>${fmt.format(totalPanels)}</p></div>
      <div class="kpi"><h4>Avance promedio</h4><p>${avgProgress}%</p></div>
    `;
  }

  function isPast(date){
    const d = parseDate(date);
    return !!(d && d <= new Date());
  }

  function computeStepScore(project){
    // 4 pasos: sitio, PPA, inicio instalación, interconexión (fe de hechos no cuenta)
    let score = 0;
    if(isPast(project.site_secured_date)) score = 25;
    if(isPast(project.ppa_secured_date)) score = 50;
    if(isPast(project.installation_start_date)) score = 75;
    if(isPast(project.interconnection_finish_date)) score = 100;
    return score;
  }

  function computePortfolioProgress(tenant){
    const arr = [...(tenant.projects||[]), ...(tenant.sociality||[])];
    if(arr.length===0) return 0;
    const totalCap = sumCapacity(arr);
    if(totalCap<=0){
      const avg = arr.reduce((a,p)=>a+computeStepScore(p),0) / arr.length;
      return Math.round(avg);
    }
    const weighted = arr.reduce((acc,p)=>{
      const cap = Number(p.size_kwp) || 0;
      return acc + computeStepScore(p) * cap;
    },0) / totalCap;
    return Math.round(weighted);
  }

  function initMap(){
    if(map) { try{ map.remove(); }catch(e){} }
    map = L.map('map');
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    map.setView(DEFAULT_CENTER, 5);
  }

  function addMarkers(projects){
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    const pts = [];
    projects.forEach(p => {
      const lat = Number(p?.coordinates?.lat);
      const lng = Number(p?.coordinates?.lng);
      if(isFinite(lat) && isFinite(lng)){
        const m = L.marker([lat,lng]).addTo(map);
        m.bindPopup(`<b>${p.name||"Proyecto"}</b><br>${p.location||""}<br>${(p.size_kwp||0)} kWp`);
        markers.push(m);
        pts.push([lat,lng]);
      }
    });
    if(pts.length){
      const bounds = L.latLngBounds(pts);
      map.fitBounds(bounds.pad(0.2));
    } else {
      map.setView(DEFAULT_CENTER, 5);
    }
  }

  function statusBadge(date){
    if(date){
      const d = parseDate(date);
      const cls = (d && d > new Date()) ? "warn" : "ok";
      return `<span class="badge ${cls}">✔ ${formatDate(date)}</span>`;
    }
    return `<span class="badge pending">Pendiente</span>`;
  }

  function translateStatus(s){
    const map = {
      'active': 'Activo',
      'in_progress': 'En Progreso',
      'pending': 'Pendiente',
      'planning': 'Planeación'
    };
    return map[s] || s;
  }

  function renderCard(p, wpp){
    // Detectar esquema construcción
    if(p.project_name || p.budget) {
       return `
      <article class="card">
        <h4>${p.project_name||"—"}</h4>
        <div class="meta">${p.description||""}</div>
        <div class="meta">
            ${p.budget ? `Presupuesto: ${fmt.format(p.budget)} ${p.currency||"USD"}` : ""}
            ${p.status ? `· Estado: ${translateStatus(p.status)}` : ""}
        </div>
        <div class="timeline">
          <div class="step">
            <div class="title">Inicio</div>
            <div class="date">${formatDate(p.start_date)}</div>
          </div>
          <div class="step">
             <div class="title">Fin Estimado</div>
             <div class="date">${formatDate(p.end_date)}</div>
          </div>
        </div>
      </article>
       `;
    }

    const eta = daysAdd(p.installation_start_date, p.installation_duration_days);
    return `
      <article class="card">
        <h4>${p.name||"—"}</h4>
        <div class="meta">${p.location||"—"} · ${p.size_kwp||0} kWp · Est. ${estimatePanels(p.size_kwp,wpp)} paneles</div>
        <div class="timeline">
          <div class="step">
            <div class="title">Sitio asegurado</div>
            <div class="date">${statusBadge(p.site_secured_date)}</div>
          </div>
          <div class="step">
            <div class="title">PPA asegurado</div>
            <div class="date">${statusBadge(p.ppa_secured_date)}</div>
          </div>
          <div class="step">
            <div class="title">Inicio instalación</div>
            <div class="date">${statusBadge(p.installation_start_date)}</div>
          </div>
          <div class="step">
            <div class="title">Fe de hechos</div>
            <div class="date">${statusBadge(p.installation_proof_date)}</div>
          </div>
          <div class="step">
            <div class="title">Interconexión</div>
            <div class="date">${statusBadge(p.interconnection_finish_date)}</div>
          </div>
        </div>
        <div class="meta" style="margin-top:6px;">
          ${eta ? `ETA fin instalación: <strong>${formatDate(eta)}</strong>` : ""}
          ${p.notes ? `<br><em>${p.notes}</em>` : ""}
        </div>
      </article>
    `;
  }

  function renderPortfolio(tenant){
    const wpp = tenant.panel_specs?.watt_per_panel || 550;
    const projHTML = (tenant.projects||[]).map(p=>renderCard(p,wpp)).join("");
    const socHTML = (tenant.sociality||[]).map(p=>renderCard(p,wpp)).join("");
    $("#projectsContainer").innerHTML = projHTML || "<p>No hay proyectos registrados.</p>";
    $("#socialityContainer").innerHTML = socHTML || "<p>No hay proyectos de Sociality aún.</p>";
  }

  function setTenantInfo(tenant){
    $("#tenantName").textContent = tenant.name || "—";
    $("#tenantLogo").src = tenant.logo || "assets/finsolar_logo.svg";
  }

  function updateUrl(slug){
    const url = new URL(window.location.href);
    // Forzar ruta con el slug y evitar exponer query params de otros tenants
    url.searchParams.delete("tenant");
    if(!url.pathname.includes(`/${slug}`)){
      url.pathname = `/${slug}/`;
    }
    history.replaceState(null, "", url.toString());
  }

  // Events
  $("#btnPrint").addEventListener("click", ()=> window.print());
  $("#btnCopyLink").addEventListener("click", ()=> {
    navigator.clipboard.writeText(window.location.href).then(()=>{
      alert("Enlace copiado.");
    }).catch(()=> alert("No se pudo copiar el enlace."));
  });

  async function main(){
    initMap();
    let manifest;
    try{
      manifest = await loadJSON("/data/manifest.json");
    }catch(e){
      alert("No se pudo cargar el manifest. Verifica /data/manifest.json");
      console.error(e);
      return;
    }
    const slug = manifest?.defaultTenant || "";
    const pathSlug = window.location.pathname.split('/').filter(Boolean)[0];
    // Redirigir a la vista exclusiva del tenant definido en el manifest
    if(pathSlug !== slug){
      updateUrl(slug);
    }

    await loadTenant(slug);
  }

  async function loadTenant(slug){
    updateUrl(slug);
    const path = `/data/tenants/${slug}.json`;
    let tenant;
    try{
      tenant = await loadJSON(path);
    }catch(e){
      alert(`No se pudo cargar ${path}. Añade el archivo mediante Admin o GitHub.`);
      throw e;
    }
    setTenantInfo(tenant);
    renderKPIs(tenant);
    renderPortfolio(tenant);
    addMarkers([...(tenant.projects||[]), ...(tenant.sociality||[])]);
  }

  main();
})();
