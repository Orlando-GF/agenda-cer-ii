(function(){
  "use strict";
  var state={user:null,needsSetup:false,professionals:[],currentSchedule:null,scheduleDirty:false,schedulePage:1};
  var $=function(id){return document.getElementById(id)};
  var esc=function(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]})};
  function titleCaseWord(word){
    if(!word)return"";
    if(word.length>1&&word===word.toUpperCase())return word;
    return word.charAt(0).toUpperCase()+word.slice(1).toLowerCase();
  }
  function titleCaseText(value){
    return String(value||"").trim().replace(/\s+/g," ").split(" ").map(function(word){
      return word.split("-").map(function(part){return part.split("'").map(titleCaseWord).join("'")}).join("-");
    }).join(" ");
  }
  function normalizeNameInput(el){if(el)el.value=titleCaseText(el.value)}
  var periodName={manha:"Manhã",tarde:"Tarde",noite:"Noite"};
  var dateBr=function(v){if(!v)return"";var p=v.split("-");return p[2]+"/"+p[1]+"/"+p[0]};
  var weekdayBr=function(v){var p=v.split("-"),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"][d.getDay()]};
  var kindLabel=function(kind){return kind==="exame"?'<span class="kind-badge exam">Exame</span>':'<span class="kind-badge consult">Consulta</span>'};
  var periodLabel=function(period,time){return'<span class="period-badge '+esc(period)+'">'+esc(periodName[period]||period)+(time?" • "+esc(time):"")+'</span>'};
  function today(){var d=new Date(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return d.getFullYear()+"-"+m+"-"+day}
  function oneMonthAgo(){var d=new Date();d.setMonth(d.getMonth()-1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function nextDate(value){if(!value)return today();var p=value.split("-"),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));d.setDate(d.getDate()+1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  async function api(path,options){
    options=options||{};options.headers=Object.assign({"content-type":"application/json"},options.headers||{});
    var res=await fetch(path,options),data=await res.json().catch(function(){return{}});
    if(!res.ok)throw new Error(data.error||"Não foi possível concluir.");
    return data;
  }
  function toast(message,isError){var el=$("toast");el.textContent=message;el.className="toast show"+(isError?" error":"");setTimeout(function(){el.className="toast"},3200)}
  function askConfirm(title,message,okText){
    return new Promise(function(resolve){
      $("confirm-title").textContent=title;$("confirm-message").textContent=message;$("confirm-ok").textContent=okText||"Confirmar";
      var dialog=$("confirm-dialog");
      dialog.onclose=function(){resolve(dialog.returnValue==="ok")};
      dialog.showModal();
    });
  }
  function go(page){
    document.querySelectorAll(".page").forEach(function(el){el.classList.add("hidden")});
    $("page-"+page).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach(function(el){el.classList.toggle("active",el.getAttribute("data-page")===page)});
    $("sidebar").classList.remove("open");
    if(page==="agenda")loadSchedules();
    if(page==="professionals")loadProfessionals(true);
    if(page==="users"){clearUserForm();loadUsers()}
    if(page==="new-schedule")loadCatalogs();
  }
  async function start(){
    $("filter-from").value=oneMonthAgo();$("filter-to").value=today();$("schedule-date").value=today();
    try{
      var data=await api("/api/status");
      state.user=data.user;state.needsSetup=data.needsSetup;
      if(data.user)showApp();else showAuth();
    }catch(e){toast(e.message,true)}
  }
  function showAuth(){
    $("auth-screen").classList.remove("hidden");$("app").classList.add("hidden");
    $("name-field").classList.toggle("hidden",!state.needsSetup);
    $("auth-subtitle").textContent=state.needsSetup?"Primeiro acesso: crie o usuário administrador.":"Entre para acessar as agendas.";
    $("auth-form").querySelector("button").textContent=state.needsSetup?"Criar administrador":"Entrar";
  }
  function showApp(){
    $("auth-screen").classList.add("hidden");$("app").classList.remove("hidden");
    $("current-user").textContent=state.user.name;
    document.querySelectorAll(".admin-only").forEach(function(el){el.classList.toggle("hidden",state.user.role!=="admin")});
    go("agenda");
  }
  $("auth-form").addEventListener("submit",async function(e){
    e.preventDefault();
    try{
      if(state.needsSetup){
        await api("/api/setup",{method:"POST",body:JSON.stringify({name:$("setup-name").value,username:$("login-user").value,password:$("login-password").value})});
        state.needsSetup=false;toast("Administrador criado. Agora faça o login.");showAuth();$("login-password").value="";
      }else{
        var data=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("login-user").value,password:$("login-password").value})});
        state.user=data.user;showApp();
      }
    }catch(err){toast(err.message,true)}
  });
  $("logout-button").addEventListener("click",async function(){await api("/api/logout",{method:"POST"});state.user=null;showAuth()});
  $("menu-button").addEventListener("click",function(){$("sidebar").classList.toggle("open")});
  document.addEventListener("click",function(e){
    var page=e.target.getAttribute("data-page")||e.target.getAttribute("data-go");
    if(page)go(page);
    var close=e.target.getAttribute("data-close");if(close)$(close).close();
    var menu=$("schedule-menu");
    if(menu&&!menu.classList.contains("hidden")&&!e.target.closest("#schedule-actions"))menu.classList.add("hidden");
  });
  document.querySelectorAll(".nav-item").forEach(function(el){el.addEventListener("click",function(){go(el.getAttribute("data-page"))})});
  $("filter-button").addEventListener("click",function(){state.schedulePage=1;loadSchedules()});
  ["filter-professional","filter-kind","filter-period","filter-status"].forEach(function(id){$(id).addEventListener("change",function(){state.schedulePage=1;loadSchedules()})});
  $("schedule-dialog").addEventListener("close",function(){if(state.scheduleDirty){state.scheduleDirty=false;loadSchedules()}});
  $("schedule-dialog").addEventListener("cancel",function(e){e.preventDefault();requestCloseSchedule()});
  async function loadAgendaFilters(){
    await loadProfessionals(false);
    var current=$("filter-professional").value;
    $("filter-professional").innerHTML='<option value="">Todos</option>'+state.professionals.filter(function(x){return x.active}).map(function(x){return'<option value="'+x.id+'">'+esc(x.name)+(x.specialty?" — "+esc(x.specialty):"")+'</option>'}).join("");
    $("filter-professional").value=current;
  }
  async function loadSchedules(){
    try{
      await loadAgendaFilters();
      var status=$("filter-status").value;
      document.querySelectorAll(".date-filter").forEach(function(el){el.classList.toggle("hidden",status==="active")});
      var params=new URLSearchParams({status:status,page:String(state.schedulePage),professional:$("filter-professional").value,kind:$("filter-kind").value,period:$("filter-period").value});
      if(status!=="active"){params.set("from",$("filter-from").value);params.set("to",$("filter-to").value)}
      var data=await api("/api/schedules?"+params.toString()),rows=data.items||[];
      $("schedule-list").classList.add("compact-list");$("schedule-list").classList.remove("schedule-grid");
      $("schedule-list").innerHTML=rows.length?renderScheduleList(rows):'<div class="empty-state card"><h3>Nenhuma agenda encontrada</h3><p>Ajuste os filtros ou crie uma nova agenda.</p></div>';
      renderPagination(data);
      document.querySelectorAll("[data-schedule]").forEach(function(el){el.addEventListener("click",function(){openSchedule(Number(el.getAttribute("data-schedule")))})});
    }catch(e){toast(e.message,true)}
  }
  function refreshSchedulesSoon(){
    state.scheduleDirty=true;
    window.clearTimeout(state.scheduleRefreshTimer);
    state.scheduleRefreshTimer=window.setTimeout(function(){if(!$("page-agenda").classList.contains("hidden"))loadSchedules()},250);
  }
  function renderPagination(data){
    var el=$("schedule-pagination"),status=$("filter-status").value,show=status!=="active"&&(data.hasMore||Number(data.page)>1);
    el.classList.toggle("hidden",!show);
    if(!show){el.innerHTML="";return}
    el.innerHTML='<button class="secondary" id="page-prev" '+(Number(data.page)<=1?"disabled":"")+'>Anterior</button><span>Página '+data.page+'</span><button class="secondary" id="page-next" '+(!data.hasMore?"disabled":"")+'>Próxima</button>';
    $("page-prev").onclick=function(){if(state.schedulePage>1){state.schedulePage--;loadSchedules()}};
    $("page-next").onclick=function(){if(data.hasMore){state.schedulePage++;loadSchedules()}};
  }
  function renderScheduleList(rows){
    var groups={};
    rows.forEach(function(s){(groups[s.schedule_date]=groups[s.schedule_date]||[]).push(s)});
    var dates=Object.keys(groups).sort();
    if($("filter-status").value!=="active")dates.reverse();
    return dates.map(function(date){
      var items=groups[date].map(function(s){
        var occupied=Number(s.occupied),cap=Number(s.capacity),pct=Math.min(100,occupied/cap*100);
        return '<button class="agenda-row '+(s.kind==="exame"?"exam ":"consult ")+(s.active?"":"closed")+'" data-schedule="'+s.id+'"><span class="agenda-row-main"><strong>'+kindLabel(s.kind)+' '+periodLabel(s.period,s.time_label)+' '+esc(s.professional_name||"Profissional não informado")+'</strong></span><span class="agenda-progress"><span><i style="width:'+pct+'%"></i></span><strong>'+occupied+'/'+cap+' vagas</strong></span>'+(s.active?"":'<span class="status off">Encerrada</span>')+'</button>';
      }).join("");
      return '<section class="agenda-day card"><h3>'+dateBr(date)+' <span>'+weekdayBr(date)+'</span></h3><div class="agenda-day-list">'+items+'</div></section>';
    }).join("");
  }
  async function loadCatalogs(){
    await loadProfessionals(false);
    updateScheduleKind();
    $("schedule-professional").innerHTML='<option value="">Selecione...</option>'+state.professionals.filter(function(x){return x.active}).map(function(x){return'<option value="'+x.id+'">'+esc(x.name)+(x.specialty?" — "+esc(x.specialty):"")+'</option>'}).join("");
  }
  $("schedule-kind").addEventListener("change",function(){
    updateScheduleKind();
  });
  function updateScheduleKind(){
    var first=$("professional-select-wrap").firstChild;
    if(first)first.textContent=$("schedule-kind").value==="exame"?"Profissional responsável pelo exame":"Profissional da consulta";
  }
  $("schedule-form").addEventListener("submit",async function(e){
    e.preventDefault();var kind=$("schedule-kind").value;
    try{
      await api("/api/schedules",{method:"POST",body:JSON.stringify({kind:kind,professional_id:$("schedule-professional").value,schedule_date:$("schedule-date").value,period:$("schedule-period").value,time_label:$("schedule-time").value,capacity:$("schedule-capacity").value,notes:$("schedule-notes").value})});
      toast("Agenda criada. Você pode cadastrar a próxima.");
      $("schedule-date").value=nextDate($("schedule-date").value);
      $("schedule-professional").value="";
      $("schedule-period").value="";
      $("schedule-time").value="";
      $("schedule-notes").value="";
      $("schedule-professional").focus();
    }catch(err){toast(err.message,true)}
  });
  async function openSchedule(id){
    try{
      var data=await api("/api/schedules/"+id);state.currentSchedule=data;
      var s=data.schedule,title=s.professional_name||"Profissional não informado",available=Number(s.capacity)-Number(s.occupied),closed=!Number(s.active);
      var tableClass="slots-table consultation-slots";
      var colgroup='<colgroup><col class="col-num"><col class="col-record"><col class="col-patient"><col class="col-observation"><col class="col-actions"></colgroup>';
      var bySlot={};data.appointments.forEach(function(a){bySlot[Number(a.slot_number)]=a});
      var rows="";
      for(var i=0;i<Number(s.capacity);i++){
        var a=bySlot[i+1]||{};
        rows+='<tr data-slot="'+i+'" data-appointment-id="'+(a.id||"")+'"><td class="slot-number col-num">'+(i+1)+'</td><td class="col-record"><input class="slot-record" value="'+esc(a.record_number||"")+'" autocomplete="off" '+(closed?"disabled":"")+'></td><td class="col-patient"><input class="slot-name" value="'+esc(a.patient_name||"")+'" autocomplete="off" '+(closed?"disabled":"")+'></td><td class="col-observation"><input class="slot-observation" value="'+esc(a.observation||"")+'" '+(closed?"disabled":"")+'></td><td class="no-print slot-actions col-actions">'+(closed?'':'<span class="slot-save-status"></span>'+(a.id?'<button class="table-action clear-slot delete-appointment" title="Limpar vaga" aria-label="Limpar vaga" data-id="'+a.id+'">🧹</button>':''))+'</td></tr>';
      }
      $("schedule-detail").innerHTML='<div class="dialog-body"><div class="dialog-header"><div><h2>'+esc(title)+' '+(closed?'<span class="status off">Encerrada</span>':'')+'</h2><p><span class="badge-line">'+kindLabel(s.kind)+periodLabel(s.period,s.time_label)+'</span> '+dateBr(s.schedule_date)+'</p></div><div class="dialog-actions no-print" id="schedule-actions"><button class="icon-button" id="schedule-settings" type="button" title="Configurações da agenda" aria-label="Configurações da agenda">⚙️</button><div class="settings-menu hidden" id="schedule-menu"><button type="button" id="edit-schedule">Editar agenda</button><button type="button" class="'+(closed?"":"danger-text")+'" id="toggle-schedule">'+(closed?"Reativar agenda":"Encerrar agenda")+'</button></div><button class="close-button" id="close-schedule" type="button">×</button></div></div><div class="detail-summary"><div class="summary-box"><strong>'+s.occupied+'</strong> agendados</div><div class="summary-box"><strong>'+available+'</strong> vagas disponíveis</div><button class="secondary no-print" id="print-button">Imprimir</button></div><h3>Vagas da agenda</h3><p class="muted no-print">'+(closed?"Esta agenda está encerrada. Reative para editar as vagas.":"Preencha direto na linha da vaga. As alterações são salvas automaticamente.")+'</p><div class="table-wrap slots-wrap"><table class="'+tableClass+'">'+colgroup+'<thead><tr><th class="col-num">#</th><th class="col-record">Prontuário</th><th class="col-patient">Paciente</th><th class="col-observation">Observação</th><th class="no-print col-actions"></th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="print-only">Impresso em '+new Date().toLocaleString("pt-BR")+'</p></div>';
      if(!$("schedule-dialog").open)$("schedule-dialog").showModal();
      $("close-schedule").onclick=requestCloseSchedule;
      $("print-button").onclick=printSchedule;
      $("schedule-settings").onclick=function(e){e.stopPropagation();$("schedule-menu").classList.toggle("hidden")};
      $("schedule-menu").onclick=function(e){e.stopPropagation()};
      $("edit-schedule").onclick=function(){$("schedule-menu").classList.add("hidden");openEditSchedule()};
      $("toggle-schedule").onclick=async function(){$("schedule-menu").classList.add("hidden");await toggleSchedule(s.id,closed)};
      document.querySelectorAll(".slot-record").forEach(function(el){el.addEventListener("blur",async function(e){await fillPatientRow(e);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-name").forEach(function(el){el.addEventListener("blur",function(e){normalizeNameInput(e.target);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-observation").forEach(function(el){el.addEventListener("blur",function(e){autoSaveSlot(e.target)})});
      document.querySelectorAll(".delete-appointment").forEach(function(el){el.onclick=function(){removeAppointment(Number(el.getAttribute("data-id")))}}); 
    }catch(e){toast(e.message,true)}
  }
  async function requestCloseSchedule(){
    $("schedule-dialog").close();
  }
  async function printSchedule(){
    if(!state.currentSchedule){toast("Abra uma agenda para imprimir.",true);return}
    var printUrl="/print/schedule/"+state.currentSchedule.schedule.id;
    var printWindow=window.open(printUrl,"_blank");
    if(printWindow)printWindow.focus();
    else window.location.href=printUrl;
  }
  async function fillPatientRow(e){
    var row=e.target.closest("tr"),q=e.target.value.trim();if(!row||!q)return;
    try{var list=await api("/api/patients/search?q="+encodeURIComponent(q));var exact=list.find(function(x){return x.record_number.toLowerCase()===q.toLowerCase()});if(exact)row.querySelector(".slot-name").value=exact.name}catch(err){}
  }
  function autoSaveSlot(el){
    var row=el.closest("tr");if(!row)return;
    var record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim();
    if(!record&&!name)return;
    saveSlot(Number(row.getAttribute("data-slot")),{silent:true,refresh:false});
  }
  function markSlotSaving(row,text,isError){
    var status=row.querySelector(".slot-save-status");if(!status)return;
    status.textContent=isError?text:"";
    status.classList.toggle("slot-save-error",!!isError);
  }
  function markSlotSaved(row){
    markSlotSaving(row,"Salvo",false);
    window.setTimeout(function(){var status=row.querySelector(".slot-save-status");if(status)status.textContent=""},1200);
  }
  function addClearButton(row,id){
    if(row.querySelector(".delete-appointment"))return;
    var actions=row.querySelector(".slot-actions");
    if(!actions)return;
    var btn=document.createElement("button");
    btn.className="table-action clear-slot delete-appointment";
    btn.type="button";
    btn.title="Limpar vaga";
    btn.setAttribute("aria-label","Limpar vaga");
    btn.setAttribute("data-id",id);
    btn.textContent="🧹";
    btn.onclick=function(){removeAppointment(Number(id))};
    actions.appendChild(btn);
  }
  async function saveSlot(index,options){
    options=options||{};
    var row=document.querySelector('tr[data-slot="'+index+'"]');if(!row)return;
    normalizeNameInput(row.querySelector(".slot-name"));
    var id=row.getAttribute("data-appointment-id"),record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim(),observation=row.querySelector(".slot-observation").value.trim();
    if(!record||!name){if(!options.silent)toast("Informe prontuário e nome do paciente.",true);else markSlotSaving(row,"Falta dados",true);return}
    var payload={schedule_id:state.currentSchedule.schedule.id,slot_number:index+1,record_number:record,patient_name:name,observation:observation};
    markSlotSaving(row,"Salvando...",false);
    try{
      if(id)await api("/api/appointments/"+id,{method:"PATCH",body:JSON.stringify(payload)});
      else{var created=await api("/api/appointments",{method:"POST",body:JSON.stringify(payload)});row.setAttribute("data-appointment-id",created.id);addClearButton(row,created.id)}
      markSlotSaved(row);
      refreshSchedulesSoon();
      if(!options.silent)toast("Vaga salva.");
      if(options.refresh!==false)openSchedule(state.currentSchedule.schedule.id);
    }catch(err){markSlotSaving(row,"Erro",true);if(!options.silent)toast(err.message,true)}
  }
  function editAppointment(id){
    var a=state.currentSchedule.appointments.find(function(x){return Number(x.id)===id});if(!a)return;
    $("edit-appointment-id").value=id;$("edit-record").value=a.record_number;$("edit-patient-name").value=a.patient_name;$("edit-observation").value=a.observation||"";$("edit-dialog").showModal();
  }
  $("edit-appointment-form").addEventListener("submit",async function(e){
    e.preventDefault();
    normalizeNameInput($("edit-patient-name"));
    try{await api("/api/appointments/"+$("edit-appointment-id").value,{method:"PATCH",body:JSON.stringify({record_number:$("edit-record").value,patient_name:$("edit-patient-name").value,observation:$("edit-observation").value})});$("edit-dialog").close();toast("Paciente atualizado.");openSchedule(state.currentSchedule.schedule.id)}catch(err){toast(err.message,true)}
  });
  async function removeAppointment(id){if(!await askConfirm("Limpar vaga","Remover este paciente desta vaga?","Limpar"))return;try{await api("/api/appointments/"+id,{method:"DELETE"});toast("Vaga limpa.");refreshSchedulesSoon();openSchedule(state.currentSchedule.schedule.id)}catch(e){toast(e.message,true)}}
  async function toggleSchedule(id,isClosed){
    if(isClosed){
      if(!await askConfirm("Reativar agenda","Esta agenda voltará para a lista de agendas ativas e poderá ser editada.","Reativar"))return;
      try{await api("/api/schedules/"+id,{method:"PATCH",body:JSON.stringify({active:true})});toast("Agenda reativada.");openSchedule(id);loadSchedules()}catch(e){toast(e.message,true)}
    }else{
      if(!await askConfirm("Encerrar agenda","Esta agenda deixará de aparecer na lista de ativas, mas poderá ser vista em Encerradas.","Encerrar"))return;
      try{await api("/api/schedules/"+id,{method:"DELETE"});toast("Agenda encerrada.");openSchedule(id);loadSchedules()}catch(e){toast(e.message,true)}
    }
  }
  async function openEditSchedule(){
    if(!state.currentSchedule)return;
    var s=state.currentSchedule.schedule;
    await loadProfessionals(false);
    $("schedule-edit-professional").innerHTML='<option value="">Selecione...</option>'+state.professionals.filter(function(x){return x.active||Number(x.id)===Number(s.professional_id)}).map(function(x){return'<option value="'+x.id+'">'+esc(x.name)+(x.specialty?" — "+esc(x.specialty):"")+'</option>'}).join("");
    $("schedule-edit-id").value=s.id;
    $("schedule-edit-kind").value=s.kind;
    $("schedule-edit-professional").value=s.professional_id||"";
    $("schedule-edit-date").value=s.schedule_date;
    $("schedule-edit-period").value=s.period;
    $("schedule-edit-time").value=s.time_label||"";
    $("schedule-edit-capacity").value=s.capacity;
    $("schedule-edit-notes").value=s.notes||"";
    updateEditScheduleKind();
    $("schedule-edit-dialog").showModal();
  }
  function updateEditScheduleKind(){
    var first=$("schedule-edit-professional-wrap").firstChild;
    if(first)first.textContent=$("schedule-edit-kind").value==="exame"?"Profissional responsável pelo exame":"Profissional da consulta";
  }
  $("schedule-edit-kind").addEventListener("change",updateEditScheduleKind);
  $("schedule-edit-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=$("schedule-edit-id").value;
    try{
      await api("/api/schedules/"+id,{method:"PATCH",body:JSON.stringify({kind:$("schedule-edit-kind").value,professional_id:$("schedule-edit-professional").value,schedule_date:$("schedule-edit-date").value,period:$("schedule-edit-period").value,time_label:$("schedule-edit-time").value,capacity:$("schedule-edit-capacity").value,notes:$("schedule-edit-notes").value})});
      $("schedule-edit-dialog").close();
      toast("Agenda atualizada.");
      openSchedule(Number(id));
      loadSchedules();
    }catch(err){toast(err.message,true)}
  });
  async function loadProfessionals(render){
    try{state.professionals=await api("/api/professionals");if(render)$("professional-list").innerHTML=tableCatalog(state.professionals,"professional")}catch(e){toast(e.message,true)}
  }
  function tableCatalog(rows,type){
    if(!rows.length)return"<p>Nenhum cadastro ainda.</p>";
    return'<table><thead><tr><th>Nome</th><th>Especialidade</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+rows.map(function(x){return'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.specialty)+'</td><td><span class="status '+(x.active?"on":"off")+'">'+(x.active?"Ativo":"Inativo")+'</span></td><td><button class="table-action edit-catalog" data-type="'+type+'" data-id="'+x.id+'">Editar</button><button class="table-action toggle-catalog" data-type="'+type+'" data-id="'+x.id+'" data-active="'+x.active+'">'+(x.active?"Desativar":"Ativar")+'</button></td></tr>'}).join("")+'</tbody></table>';
  }
  ["professional-name","professional-specialty","user-name","edit-patient-name","catalog-edit-name","catalog-edit-specialty"].forEach(function(id){var el=$(id);if(el)el.addEventListener("blur",function(){normalizeNameInput(el)})});
  $("professional-form").addEventListener("submit",async function(e){e.preventDefault();normalizeNameInput($("professional-name"));normalizeNameInput($("professional-specialty"));try{await api("/api/professionals",{method:"POST",body:JSON.stringify({name:$("professional-name").value,specialty:$("professional-specialty").value})});this.reset();toast("Profissional cadastrado.");loadProfessionals(true)}catch(err){toast(err.message,true)}});
  document.addEventListener("click",async function(e){
    if(!e.target.classList.contains("toggle-catalog"))return;
    var type=e.target.getAttribute("data-type"),id=e.target.getAttribute("data-id"),active=e.target.getAttribute("data-active")==="1",x=state.professionals.find(function(r){return String(r.id)===id});
    if(!x)return;var payload={name:x.name,specialty:x.specialty,active:!active};
    try{await api("/api/professionals/"+id,{method:"PATCH",body:JSON.stringify(payload)});toast(active?"Cadastro desativado.":"Cadastro ativado.");loadProfessionals(true)}catch(err){toast(err.message,true)}
  });
  document.addEventListener("click",async function(e){
    if(!e.target.classList.contains("edit-catalog"))return;
    var type=e.target.getAttribute("data-type"),id=e.target.getAttribute("data-id"),x=state.professionals.find(function(r){return String(r.id)===id});
    if(!x)return;
    $("catalog-dialog-title").textContent="Editar profissional";
    $("catalog-edit-type").value=type;$("catalog-edit-id").value=id;$("catalog-edit-name").value=x.name;
    $("catalog-specialty-wrap").classList.remove("hidden");
    $("catalog-edit-specialty").value=x.specialty||"";
    $("catalog-dialog").showModal();
  });
  $("catalog-edit-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=$("catalog-edit-id").value,x=state.professionals.find(function(r){return String(r.id)===id});
    if(!x)return;
    normalizeNameInput($("catalog-edit-name"));
    normalizeNameInput($("catalog-edit-specialty"));
    var payload={name:$("catalog-edit-name").value.trim(),active:!!x.active};
    if(!payload.name){toast("Informe o nome.",true);return}
    payload.specialty=$("catalog-edit-specialty").value.trim();
    try{await api("/api/professionals/"+id,{method:"PATCH",body:JSON.stringify(payload)});$("catalog-dialog").close();toast("Cadastro atualizado.");loadProfessionals(true)}catch(err){toast(err.message,true)}
  });
  async function loadUsers(){
    if(state.user.role!=="admin")return;
    try{var rows=await api("/api/users");$("user-list").innerHTML=rows.length?'<table><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+rows.map(function(x){return'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.username)+'</td><td>'+esc(x.role==="admin"?"Administrador":"Atendente")+'</td><td><span class="status '+(x.active?"on":"off")+'">'+(x.active?"Ativo":"Inativo")+'</span></td><td><button class="table-action toggle-user" data-id="'+x.id+'" data-name="'+esc(x.name)+'" data-role="'+x.role+'" data-active="'+x.active+'">'+(x.active?"Desativar":"Ativar")+'</button></td></tr>'}).join("")+'</tbody></table>':"<p>Nenhum usuário.</p>"}catch(e){toast(e.message,true)}
  }
  function clearUserForm(){
    if(!$("user-form"))return;
    $("user-form").reset();
    $("user-name").value="";
    $("user-username").value="";
    $("user-password").value="";
    $("user-role").value="atendente";
    setTimeout(function(){
      $("user-name").value="";
      $("user-username").value="";
      $("user-password").value="";
    },100);
  }
  $("user-form").addEventListener("submit",async function(e){e.preventDefault();normalizeNameInput($("user-name"));try{await api("/api/users",{method:"POST",body:JSON.stringify({name:$("user-name").value,username:$("user-username").value,password:$("user-password").value,role:$("user-role").value})});this.reset();toast("Usuário cadastrado.");loadUsers()}catch(err){toast(err.message,true)}});
  document.addEventListener("click",async function(e){if(!e.target.classList.contains("toggle-user"))return;try{await api("/api/users/"+e.target.getAttribute("data-id"),{method:"PATCH",body:JSON.stringify({name:e.target.getAttribute("data-name"),role:e.target.getAttribute("data-role"),active:e.target.getAttribute("data-active")!=="1"})});toast("Usuário atualizado.");loadUsers()}catch(err){toast(err.message,true)}});
  start();
})();
