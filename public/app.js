(function(){
  "use strict";
  var state={user:null,needsSetup:false,professionals:[],queueSpecialties:[],queueProfessionals:[],queueRequests:[],currentSchedule:null,scheduleDirty:false,schedulePage:1,queuePage:1};
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
  function upperCaseText(value){return String(value||"").trim().replace(/\s+/g," ").toLocaleUpperCase("pt-BR")}
  function normalizeSlotInput(el){if(el)el.value=upperCaseText(el.value)}
  function phoneMask(value){
    var digits=String(value||"").replace(/\D/g,"").slice(0,11);
    if(digits.length<=2)return digits;
    if(digits.length<=6)return"("+digits.slice(0,2)+") "+digits.slice(2);
    if(digits.length<=10)return"("+digits.slice(0,2)+") "+digits.slice(2,6)+"-"+digits.slice(6);
    return"("+digits.slice(0,2)+") "+digits.slice(2,7)+"-"+digits.slice(7);
  }
  var periodName={manha:"Manhã",tarde:"Tarde",noite:"Noite"};
  var dateBr=function(v){if(!v)return"";var p=v.split("-");return p[2]+"/"+p[1]+"/"+p[0]};
  var weekdayBr=function(v){var p=v.split("-"),d=new Date(Number(p[0]),Number(p[1])-1,Number(p[2]));return ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"][d.getDay()]};
  var kindLabel=function(kind){
    if(kind==="exame")return'<span class="kind-badge exam">Exame</span>';
    if(kind==="orientacao")return'<span class="kind-badge orientation">Orientação familiar</span>';
    return'<span class="kind-badge consult">Consulta</span>';
  };
  var kindClass=function(kind){return kind==="exame"?"exam":kind==="orientacao"?"orientation":"consult"};
  var professionalLabel=function(kind){
    if(kind==="exame")return"Profissional responsável pelo exame";
    if(kind==="orientacao")return"Profissional da orientação";
    return"Profissional da consulta";
  };
  var periodLabel=function(period,time){return'<span class="period-badge '+esc(period)+'">'+esc(periodName[period]||period)+(time?" • "+esc(time):"")+'</span>'};
  var queueStatusNames={aguardando:"Aguardando",chamado:"Chamado",atendido:"Atendido",nao_compareceu:"Não compareceu",desistiu:"Desistiu",cancelado:"Cancelado"};
  var queueOpenStatuses={aguardando:true,chamado:true};
  function today(){var d=new Date(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");return d.getFullYear()+"-"+m+"-"+day}
  function oneMonthAgo(){var d=new Date();d.setMonth(d.getMonth()-1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
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
    if(page==="waitlist")loadWaitlistPage();
    if(page==="new-queue-request")loadNewQueueRequestPage();
    if(page==="queue-catalogs")loadQueueCatalogPage();
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
  ["queue-filter-specialty","queue-filter-status"].forEach(function(id){$(id).addEventListener("change",function(){state.queuePage=1;loadQueueRequests()})});
  $("queue-filter-button").addEventListener("click",function(){state.queuePage=1;loadQueueRequests()});
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
      $("schedule-list").classList.add("compact-list");
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
      var byProfessional={};
      groups[date].forEach(function(s){var name=s.professional_name||"Profissional não informado";(byProfessional[name]=byProfessional[name]||[]).push(s)});
      var items=Object.keys(byProfessional).sort(function(a,b){return a.localeCompare(b,"pt-BR")}).map(function(name){
        var rows=byProfessional[name].map(function(s){
          var occupied=Number(s.occupied),cap=Number(s.capacity),pct=Math.min(100,occupied/cap*100);
          return '<button class="agenda-row '+kindClass(s.kind)+' '+(s.active?"":"closed")+'" data-schedule="'+s.id+'"><span class="agenda-row-main"><strong>'+kindLabel(s.kind)+' '+periodLabel(s.period,s.time_label)+'</strong></span><span class="agenda-progress"><span><i style="width:'+pct+'%"></i></span><strong>'+occupied+'/'+cap+' vagas</strong></span>'+(s.active?"":'<span class="status off">Encerrada</span>')+'</button>';
        }).join("");
        return '<div class="agenda-professional"><h4>'+esc(name)+'</h4>'+rows+'</div>';
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
    if(first)first.textContent=professionalLabel($("schedule-kind").value);
  }
  $("schedule-form").addEventListener("submit",async function(e){
    e.preventDefault();var kind=$("schedule-kind").value;
    try{
      await api("/api/schedules",{method:"POST",body:JSON.stringify({kind:kind,professional_id:$("schedule-professional").value,schedule_date:$("schedule-date").value,period:$("schedule-period").value,time_label:$("schedule-time").value,capacity:$("schedule-capacity").value,notes:$("schedule-notes").value})});
      toast("Agenda criada. Você pode cadastrar a próxima.");
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
      var isFamily=s.kind==="orientacao";
      var tableClass="slots-table consultation-slots"+(isFamily?" family-slots":"");
      var colgroup=isFamily?'<colgroup><col class="col-num"><col class="col-record"><col class="col-patient"><col class="col-relation"><col class="col-linked-record"><col class="col-observation"><col class="col-actions"></colgroup>':'<colgroup><col class="col-num"><col class="col-record"><col class="col-patient"><col class="col-observation"><col class="col-actions"></colgroup>';
      var tableHead=isFamily?'<tr><th class="col-num">#</th><th class="col-record">Prontuário familiar</th><th class="col-patient">Familiar</th><th class="col-relation">Vínculo</th><th class="col-linked-record">Prontuário paciente</th><th class="col-observation">Observação</th><th class="no-print col-actions"></th></tr>':'<tr><th class="col-num">#</th><th class="col-record">Prontuário</th><th class="col-patient">Paciente</th><th class="col-observation">Observação</th><th class="no-print col-actions"></th></tr>';
      var bySlot={};data.appointments.forEach(function(a){bySlot[Number(a.slot_number)]=a});
      var rows="";
      for(var i=0;i<Number(s.capacity);i++){
        var a=bySlot[i+1]||{};
        var hasContent=!!(a.id||a.record_number||a.patient_name||a.family_relation||a.linked_patient_record||a.observation);
        var currentRelation=upperCaseText(a.family_relation||"");
        var relation='<select class="slot-relation" '+(closed?"disabled":"")+'><option value="">SELECIONE...</option><option value="MÃE" '+(currentRelation==="MÃE"?"selected":"")+'>MÃE</option><option value="PAI" '+(currentRelation==="PAI"?"selected":"")+'>PAI</option><option value="RESPONSÁVEL" '+(currentRelation==="RESPONSÁVEL"?"selected":"")+'>RESPONSÁVEL</option><option value="OUTRO" '+(currentRelation==="OUTRO"?"selected":"")+'>OUTRO</option></select>';
        rows+='<tr data-slot="'+i+'" data-appointment-id="'+(a.id||"")+'"><td class="slot-number col-num">'+(i+1)+'</td><td class="col-record"><input class="slot-record" value="'+esc(a.record_number||"")+'" autocomplete="off" '+(closed?"disabled":"")+'></td><td class="col-patient"><input class="slot-name" value="'+esc(a.patient_name||"")+'" autocomplete="off" '+(closed?"disabled":"")+'></td>'+(isFamily?'<td class="col-relation">'+relation+'</td><td class="col-linked-record"><input class="slot-linked-record" value="'+esc(a.linked_patient_record||"")+'" autocomplete="off" '+(closed?"disabled":"")+'></td>':'')+'<td class="col-observation"><input class="slot-observation" value="'+esc(a.observation||"")+'" '+(closed?"disabled":"")+'></td><td class="no-print slot-actions col-actions">'+(closed?'':'<button class="table-action clear-slot clear-row" title="Limpar vaga" aria-label="Limpar vaga" '+(a.id?'data-id="'+a.id+'"':"")+' '+(hasContent?"":"disabled")+'>🧹</button>')+'</td></tr>';
      }
      $("schedule-detail").innerHTML='<div class="dialog-body"><div class="dialog-header"><div><h2>'+esc(title)+' '+(closed?'<span class="status off">Encerrada</span>':'')+'</h2><p><span class="badge-line">'+kindLabel(s.kind)+periodLabel(s.period,s.time_label)+'</span> '+dateBr(s.schedule_date)+'</p></div><div class="dialog-actions no-print" id="schedule-actions"><button class="icon-button" id="schedule-settings" type="button" title="Configurações da agenda" aria-label="Configurações da agenda">⚙️</button><div class="settings-menu hidden" id="schedule-menu"><button type="button" id="edit-schedule">Editar agenda</button><button type="button" class="'+(closed?"":"danger-text")+'" id="toggle-schedule">'+(closed?"Reativar agenda":"Encerrar agenda")+'</button></div><button class="close-button" id="close-schedule" type="button">×</button></div></div><div class="detail-summary"><div class="summary-box"><strong>'+s.occupied+'</strong> agendados</div><div class="summary-box"><strong>'+available+'</strong> vagas disponíveis</div><button class="secondary no-print" id="print-button">Imprimir</button></div><h3>Vagas da agenda</h3><p class="muted no-print">'+(closed?"Esta agenda está encerrada. Reative para editar as vagas.":(isFamily?"Informe o familiar atendido e o prontuário do paciente vinculado. As alterações são salvas automaticamente.":"Preencha direto na linha da vaga. As alterações são salvas automaticamente."))+'</p><div class="table-wrap slots-wrap"><table class="'+tableClass+'">'+colgroup+'<thead>'+tableHead+'</thead><tbody>'+rows+'</tbody></table></div><p class="print-only">Impresso em '+new Date().toLocaleString("pt-BR")+'</p></div>';
      if(!$("schedule-dialog").open)$("schedule-dialog").showModal();
      $("close-schedule").onclick=requestCloseSchedule;
      $("print-button").onclick=printSchedule;
      $("schedule-settings").onclick=function(e){e.stopPropagation();$("schedule-menu").classList.toggle("hidden")};
      $("schedule-menu").onclick=function(e){e.stopPropagation()};
      $("edit-schedule").onclick=function(){$("schedule-menu").classList.add("hidden");openEditSchedule()};
      $("toggle-schedule").onclick=async function(){$("schedule-menu").classList.add("hidden");await toggleSchedule(s.id,closed)};
      document.querySelectorAll(".slot-record").forEach(function(el){el.addEventListener("blur",async function(e){normalizeSlotInput(e.target);await fillPatientRow(e);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-name").forEach(function(el){el.addEventListener("blur",function(e){normalizeSlotInput(e.target);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-observation").forEach(function(el){el.addEventListener("blur",function(e){normalizeSlotInput(e.target);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-linked-record").forEach(function(el){el.addEventListener("blur",function(e){normalizeSlotInput(e.target);autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-relation").forEach(function(el){el.addEventListener("change",function(e){autoSaveSlot(e.target)})});
      document.querySelectorAll(".slot-record,.slot-name,.slot-observation,.slot-linked-record,.slot-relation").forEach(function(el){el.addEventListener("input",function(e){var row=e.target.closest("tr");if(row)updateClearButton(row)})});
      document.querySelectorAll(".slot-record,.slot-name,.slot-observation,.slot-linked-record,.slot-relation").forEach(function(el){el.addEventListener("keydown",handleSlotEnterAsTab)});
      document.querySelectorAll(".clear-row").forEach(function(el){el.onclick=function(){clearSlot(el)}}); 
    }catch(e){toast(e.message,true)}
  }
  async function requestCloseSchedule(){
    var pending=partialRows();
    if(pending.length&&!(await askConfirm("Vaga incompleta","Existe vaga com prontuário ou nome sem completar. Deseja fechar sem salvar?","Fechar mesmo")))return;
    $("schedule-dialog").close();
  }
  async function printSchedule(){
    if(!state.currentSchedule){toast("Abra uma agenda para imprimir.",true);return}
    var pending=partialRows();
    if(pending.length){toast("Complete ou limpe as vagas incompletas antes de imprimir.",true);return}
    var printUrl="/print/schedule/"+state.currentSchedule.schedule.id;
    var printWindow=window.open(printUrl,"_blank");
    if(printWindow)printWindow.focus();
    else window.location.href=printUrl;
  }
  async function fillPatientRow(e){
    var row=e.target.closest("tr"),q=e.target.value.trim();if(!row||!q)return;
    if(q.toLowerCase()==="novo")return;
    try{var list=await api("/api/patients/search?q="+encodeURIComponent(q));var exact=list.find(function(x){return x.record_number.toLowerCase()===q.toLowerCase()});if(exact)row.querySelector(".slot-name").value=upperCaseText(exact.name)}catch(err){}
  }
  function handleSlotEnterAsTab(e){
    if(e.key!=="Enter")return;
    e.preventDefault();
    var fields=Array.from(document.querySelectorAll("#schedule-dialog .slot-record,#schedule-dialog .slot-name,#schedule-dialog .slot-relation,#schedule-dialog .slot-linked-record,#schedule-dialog .slot-observation")).filter(function(el){return !el.disabled&&el.offsetParent!==null});
    var index=fields.indexOf(e.target),next=fields[index+(e.shiftKey?-1:1)];
    if(next)next.focus();
  }
  function autoSaveSlot(el){
    var row=el.closest("tr");if(!row)return;
    var record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim();
    updateClearButton(row);
    if(!record&&!name)return;
    saveSlot(Number(row.getAttribute("data-slot")),{silent:true,refresh:false});
  }
  function partialRows(){
    return Array.from(document.querySelectorAll("#schedule-dialog tbody tr")).filter(function(row){
      var record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim(),linked=row.querySelector(".slot-linked-record"),relation=row.querySelector(".slot-relation"),observation=row.querySelector(".slot-observation").value.trim();
      linked=linked?linked.value.trim():"";relation=relation?relation.value.trim():"";
      var hasAny=!!(record||name||linked||relation||observation);
      if(!hasAny)return false;
      if(linked||relation)return !(record&&name&&linked);
      return (record&&!name)||(!record&&name);
    });
  }
  function updateClearButton(row){
    var btn=row.querySelector(".clear-row");if(!btn)return;
    var id=row.getAttribute("data-appointment-id"),record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim(),observation=row.querySelector(".slot-observation").value.trim(),linked=row.querySelector(".slot-linked-record"),relation=row.querySelector(".slot-relation");
    linked=linked?linked.value.trim():"";relation=relation?relation.value.trim():"";
    btn.disabled=!(id||record||name||observation||linked||relation);
  }
  async function clearSlot(btn){
    var row=btn.closest("tr");if(!row)return;
    var id=row.getAttribute("data-appointment-id");
    if(id){await removeAppointment(Number(id));return}
    row.querySelector(".slot-record").value="";
    row.querySelector(".slot-name").value="";
    row.querySelector(".slot-observation").value="";
    var linked=row.querySelector(".slot-linked-record"),relation=row.querySelector(".slot-relation");
    if(linked)linked.value="";
    if(relation)relation.value="";
    updateClearButton(row);
  }
  async function saveSlot(index,options){
    options=options||{};
    var row=document.querySelector('tr[data-slot="'+index+'"]');if(!row)return;
    normalizeSlotInput(row.querySelector(".slot-record"));
    normalizeSlotInput(row.querySelector(".slot-name"));
    normalizeSlotInput(row.querySelector(".slot-linked-record"));
    normalizeSlotInput(row.querySelector(".slot-observation"));
    var id=row.getAttribute("data-appointment-id"),record=row.querySelector(".slot-record").value.trim(),name=row.querySelector(".slot-name").value.trim(),observation=row.querySelector(".slot-observation").value.trim(),linked=row.querySelector(".slot-linked-record"),relation=row.querySelector(".slot-relation");
    linked=linked?linked.value.trim():"";relation=relation?relation.value.trim():"";
    updateClearButton(row);
    if(!record||!name){if(!options.silent)toast("Informe prontuário e nome do paciente.",true);return}
    if(state.currentSchedule&&state.currentSchedule.schedule.kind==="orientacao"&&!linked){if(!options.silent)toast("Informe o prontuário do paciente vinculado.",true);return}
    var payload={schedule_id:state.currentSchedule.schedule.id,slot_number:index+1,record_number:record,patient_name:name,observation:observation,family_relation:relation,linked_patient_record:linked};
    try{
      if(id)await api("/api/appointments/"+id,{method:"PATCH",body:JSON.stringify(payload)});
      else{var created=await api("/api/appointments",{method:"POST",body:JSON.stringify(payload)});row.setAttribute("data-appointment-id",created.id);var btn=row.querySelector(".clear-row");if(btn)btn.setAttribute("data-id",created.id)}
      updateClearButton(row);
      refreshSchedulesSoon();
      if(!options.silent)toast("Vaga salva.");
      if(options.refresh!==false)openSchedule(state.currentSchedule.schedule.id);
    }catch(err){if(!options.silent)toast(err.message,true);else toast("Não foi possível salvar uma vaga.",true)}
  }
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
    if(first)first.textContent=professionalLabel($("schedule-edit-kind").value);
  }
  $("schedule-edit-kind").addEventListener("change",updateEditScheduleKind);
  ["schedule-capacity","schedule-edit-capacity"].forEach(function(id){
    var el=$(id);
    if(el)el.addEventListener("focus",function(){setTimeout(function(){el.select()},0)});
  });
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
  ["professional-name","professional-specialty","user-name","catalog-edit-name","catalog-edit-specialty"].forEach(function(id){var el=$(id);if(el)el.addEventListener("blur",function(){normalizeNameInput(el)})});
  $("professional-form").addEventListener("submit",async function(e){e.preventDefault();normalizeNameInput($("professional-name"));normalizeNameInput($("professional-specialty"));try{await api("/api/professionals",{method:"POST",body:JSON.stringify({name:$("professional-name").value,specialty:$("professional-specialty").value})});this.reset();toast("Profissional cadastrado.");loadProfessionals(true)}catch(err){toast(err.message,true)}});
  document.addEventListener("click",async function(e){
    if(!e.target.classList.contains("toggle-catalog"))return;
    var type=e.target.getAttribute("data-type"),id=e.target.getAttribute("data-id"),active=e.target.getAttribute("data-active")==="1",x=state.professionals.find(function(r){return String(r.id)===id});
    if(!x)return;var payload={name:x.name,specialty:x.specialty,active:!active};
    try{await api("/api/professionals/"+id,{method:"PATCH",body:JSON.stringify(payload)});toast(active?"Cadastro desativado.":"Cadastro ativado.");loadProfessionals(true)}catch(err){toast(err.message,true)}
  });
  document.addEventListener("click",async function(e){
    if(!e.target.classList.contains("edit-catalog"))return;
    var id=e.target.getAttribute("data-id"),x=state.professionals.find(function(r){return String(r.id)===id});
    if(!x)return;
    $("catalog-dialog-title").textContent="Editar profissional";
    $("catalog-edit-id").value=id;$("catalog-edit-name").value=x.name;
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

  async function loadQueueCatalogs(){
    state.queueSpecialties=await api("/api/queue/specialties");
    state.queueProfessionals=await api("/api/queue/professionals");
  }
  function activeQueueSpecialtyOptions(selected){
    return '<option value="">Selecione...</option>'+state.queueSpecialties.filter(function(x){return x.active||String(x.id)===String(selected||"")}).map(function(x){return'<option value="'+x.id+'" '+(String(x.id)===String(selected||"")?"selected":"")+'>'+esc(x.name)+'</option>'}).join("");
  }
  function activeQueueProfessionalOptions(selected){
    return '<option value="">Selecione...</option>'+state.queueProfessionals.filter(function(x){return x.active||String(x.id)===String(selected||"")}).map(function(x){return'<option value="'+x.id+'" '+(String(x.id)===String(selected||"")?"selected":"")+'>'+esc(x.name)+' — '+esc(x.specialty_name)+'</option>'}).join("");
  }
  async function loadWaitlistPage(){
    try{
      await loadQueueCatalogs();
      $("queue-filter-specialty").innerHTML='<option value="">Todas</option>'+state.queueSpecialties.map(function(x){return'<option value="'+x.id+'">'+esc(x.name)+(x.active?"":" — inativa")+'</option>'}).join("");
      loadQueueRequests();
    }catch(e){toast(e.message,true)}
  }
  async function loadNewQueueRequestPage(){
    try{
      await loadQueueCatalogs();
      if(!$("queue-medical-date").value)$("queue-medical-date").value=today();
      $("queue-specialty").innerHTML=activeQueueSpecialtyOptions();
      updateQueueRequesterOptions();
    }catch(e){toast(e.message,true)}
  }
  function updateQueueRequesterOptions(){
    $("queue-requester").innerHTML=activeQueueProfessionalOptions("");
  }
  $("queue-request-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var payload={
      record_number:upperCaseText($("queue-record").value),
      patient_name:upperCaseText($("queue-patient").value),
      phone:phoneMask($("queue-phone").value),
      specialty_id:$("queue-specialty").value,
      requester_id:$("queue-requester").value,
      requested_procedure:upperCaseText($("queue-procedure").value),
      medical_request_date:$("queue-medical-date").value,
      observation:upperCaseText($("queue-observation").value)
    };
    try{
      var result=await api("/api/queue/requests",{method:"POST",body:JSON.stringify(payload)});
      $("queue-request-form").reset();
      $("queue-medical-date").value=today();
      toast(result.warning||"Solicitação adicionada à fila.",!!result.warning);
      loadNewQueueRequestPage();
    }catch(err){toast(err.message,true)}
  });
  $("queue-phone").addEventListener("input",function(e){e.target.value=phoneMask(e.target.value)});
  $("queue-phone").addEventListener("blur",function(e){e.target.value=phoneMask(e.target.value)});
  ["queue-record","queue-patient","queue-procedure","queue-observation"].forEach(function(id){var el=$(id);if(el)el.addEventListener("blur",function(){normalizeSlotInput(el)})});
  async function loadQueueRequests(){
    try{
      var params=new URLSearchParams({page:String(state.queuePage),specialty:$("queue-filter-specialty").value,status:$("queue-filter-status").value,q:$("queue-search").value.trim()});
      var data=await api("/api/queue/requests?"+params.toString()),rows=data.items||[];
      state.queueRequests=rows;
      $("queue-list").innerHTML=rows.length?renderQueueTable(rows):'<p>Nenhuma solicitação encontrada.</p>';
      renderQueuePagination(data);
    }catch(e){toast(e.message,true)}
  }
  function renderQueueTable(rows){
    var lastSpecialty="";
    return '<table class="queue-table"><thead><tr><th>Solicitação</th><th>Paciente</th><th>Telefone</th><th>Profissional</th><th>Status</th><th>Ação</th></tr></thead><tbody>'+rows.map(function(x){
      var open=!!queueOpenStatuses[x.status],called=x.called_at?'<br><small>Chamado: '+dateTimeBr(x.called_at)+'</small>':"";
      var group=lastSpecialty!==x.specialty_name?'<tr class="queue-group"><td colspan="6">'+esc(x.specialty_name)+'</td></tr>':"";
      lastSpecialty=x.specialty_name;
      return group+'<tr><td>'+dateBr(x.medical_request_date)+'<br><small>'+esc(x.requested_procedure)+'</small></td><td><strong>'+esc(x.record_number)+'</strong><br>'+esc(x.patient_name)+'</td><td>'+esc(x.phone||"")+'</td><td>'+esc(x.requester_name)+'</td><td><span class="queue-status '+esc(x.status)+'">'+esc(queueStatusNames[x.status]||x.status)+'</span>'+called+'</td><td class="queue-actions"><button class="table-action queue-edit" data-id="'+x.id+'">Editar</button>'+(x.status==="aguardando"?'<button class="table-action queue-call" data-id="'+x.id+'">Chamar</button>':"")+(open?'<select class="queue-status-change" data-id="'+x.id+'"><option value="">Alterar...</option><option value="atendido">Atendido</option><option value="nao_compareceu">Não compareceu</option><option value="desistiu">Desistiu</option><option value="cancelado">Cancelado</option></select>':"")+'<button class="table-action queue-history" data-id="'+x.id+'">Histórico</button></td></tr>';
    }).join("")+'</tbody></table>';
  }
  function dateTimeBr(value){
    if(!value)return"";
    var d=new Date(String(value).replace(" ","T")+"Z");
    return isNaN(d.getTime())?String(value):d.toLocaleString("pt-BR");
  }
  function renderQueuePagination(data){
    var el=$("queue-pagination"),show=data.hasMore||Number(data.page)>1;
    el.classList.toggle("hidden",!show);
    if(!show){el.innerHTML="";return}
    el.innerHTML='<button class="secondary" id="queue-prev" '+(Number(data.page)<=1?"disabled":"")+'>Anterior</button><span>Página '+data.page+'</span><button class="secondary" id="queue-next" '+(!data.hasMore?"disabled":"")+'>Próxima</button>';
    $("queue-prev").onclick=function(){if(state.queuePage>1){state.queuePage--;loadQueueRequests()}};
    $("queue-next").onclick=function(){if(data.hasMore){state.queuePage++;loadQueueRequests()}};
  }
  document.addEventListener("click",async function(e){
    if(e.target.classList.contains("queue-edit")){
      openEditQueueRequest(e.target.getAttribute("data-id"));
    }
    if(e.target.classList.contains("queue-call")){
      if(!await askConfirm("Chamar paciente","Marcar esta solicitação como chamada agora?","Chamar"))return;
      try{await api("/api/queue/requests/"+e.target.getAttribute("data-id"),{method:"PATCH",body:JSON.stringify({status:"chamado"})});toast("Solicitação chamada.");loadQueueRequests()}catch(err){toast(err.message,true)}
    }
    if(e.target.classList.contains("queue-history")){
      try{
        var rows=await api("/api/queue/requests/"+e.target.getAttribute("data-id")+"/movements");
        $("queue-history-list").innerHTML=rows.length?'<table><thead><tr><th>Data</th><th>Ação</th><th>Status</th><th>Usuário</th></tr></thead><tbody>'+rows.map(function(x){return'<tr><td>'+dateTimeBr(x.created_at)+'</td><td>'+esc(x.action)+'</td><td>'+esc((queueStatusNames[x.from_status]||x.from_status||"")+(x.to_status?" → "+(queueStatusNames[x.to_status]||x.to_status):""))+'</td><td>'+esc(x.user_name||"")+'</td></tr>'}).join("")+'</tbody></table>':'<p>Nenhuma movimentação.</p>';
        $("queue-history-dialog").showModal();
      }catch(err){toast(err.message,true)}
    }
  });
  async function openEditQueueRequest(id){
    var x=state.queueRequests.find(function(row){return String(row.id)===String(id)});
    if(!x)return;
    await loadQueueCatalogs();
    $("queue-edit-id").value=x.id;
    $("queue-edit-record").value=x.record_number||"";
    $("queue-edit-patient").value=x.patient_name||"";
    $("queue-edit-phone").value=phoneMask(x.phone||"");
    $("queue-edit-specialty").innerHTML=activeQueueSpecialtyOptions(x.specialty_id);
    $("queue-edit-requester").innerHTML=activeQueueProfessionalOptions(x.requester_id);
    $("queue-edit-medical-date").value=x.medical_request_date||"";
    $("queue-edit-status").value=x.status||"aguardando";
    $("queue-edit-procedure").value=x.requested_procedure||"";
    $("queue-edit-observation").value=x.observation||"";
    $("queue-request-edit-dialog").showModal();
  }
  $("queue-edit-phone").addEventListener("input",function(e){e.target.value=phoneMask(e.target.value)});
  ["queue-edit-record","queue-edit-patient","queue-edit-procedure","queue-edit-observation"].forEach(function(id){var el=$(id);if(el)el.addEventListener("blur",function(){normalizeSlotInput(el)})});
  $("queue-request-edit-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=$("queue-edit-id").value;
    var payload={
      record_number:upperCaseText($("queue-edit-record").value),
      patient_name:upperCaseText($("queue-edit-patient").value),
      phone:phoneMask($("queue-edit-phone").value),
      specialty_id:$("queue-edit-specialty").value,
      requester_id:$("queue-edit-requester").value,
      medical_request_date:$("queue-edit-medical-date").value,
      status:$("queue-edit-status").value,
      requested_procedure:upperCaseText($("queue-edit-procedure").value),
      observation:upperCaseText($("queue-edit-observation").value)
    };
    try{await api("/api/queue/requests/"+id,{method:"PATCH",body:JSON.stringify(payload)});$("queue-request-edit-dialog").close();toast("Solicitação atualizada.");loadQueueRequests()}catch(err){toast(err.message,true)}
  });
  document.addEventListener("change",async function(e){
    if(!e.target.classList.contains("queue-status-change")||!e.target.value)return;
    try{await api("/api/queue/requests/"+e.target.getAttribute("data-id"),{method:"PATCH",body:JSON.stringify({status:e.target.value})});toast("Status atualizado.");loadQueueRequests()}catch(err){toast(err.message,true)}
  });

  async function loadQueueCatalogPage(){
    try{
      await loadQueueCatalogs();
      $("queue-professional-specialty").innerHTML=activeQueueSpecialtyOptions();
      $("queue-specialty-list").innerHTML=renderQueueSpecialties();
      $("queue-professional-list").innerHTML=renderQueueProfessionals();
    }catch(e){toast(e.message,true)}
  }
  function renderQueueSpecialties(){
    if(!state.queueSpecialties.length)return"<p>Nenhuma especialidade cadastrada.</p>";
    return '<table><thead><tr><th>Especialidade</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+state.queueSpecialties.map(function(x){return'<tr><td>'+esc(x.name)+'</td><td><span class="status '+(x.active?"on":"off")+'">'+(x.active?"Ativo":"Inativo")+'</span></td><td><button class="table-action edit-queue-specialty" data-id="'+x.id+'">Editar</button><button class="table-action toggle-queue-specialty" data-id="'+x.id+'" data-name="'+esc(x.name)+'" data-active="'+x.active+'">'+(x.active?"Desativar":"Ativar")+'</button></td></tr>'}).join("")+'</tbody></table>';
  }
  function renderQueueProfessionals(){
    if(!state.queueProfessionals.length)return"<p>Nenhum profissional cadastrado.</p>";
    return '<table><thead><tr><th>Nome</th><th>Especialidade</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+state.queueProfessionals.map(function(x){return'<tr><td>'+esc(x.name)+'</td><td>'+esc(x.specialty_name)+'</td><td><span class="status '+(x.active?"on":"off")+'">'+(x.active?"Ativo":"Inativo")+'</span></td><td><button class="table-action edit-queue-professional" data-id="'+x.id+'">Editar</button><button class="table-action toggle-queue-professional" data-id="'+x.id+'" data-name="'+esc(x.name)+'" data-specialty="'+x.specialty_id+'" data-active="'+x.active+'">'+(x.active?"Desativar":"Ativar")+'</button></td></tr>'}).join("")+'</tbody></table>';
  }
  $("queue-specialty-form").addEventListener("submit",async function(e){e.preventDefault();normalizeNameInput($("queue-specialty-name"));try{await api("/api/queue/specialties",{method:"POST",body:JSON.stringify({name:$("queue-specialty-name").value})});this.reset();toast("Especialidade cadastrada.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}});
  $("queue-professional-form").addEventListener("submit",async function(e){e.preventDefault();normalizeNameInput($("queue-professional-name"));try{await api("/api/queue/professionals",{method:"POST",body:JSON.stringify({name:$("queue-professional-name").value,specialty_id:$("queue-professional-specialty").value})});this.reset();toast("Profissional cadastrado.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}});
  document.addEventListener("click",async function(e){
    if(e.target.classList.contains("edit-queue-specialty")){
      var specialty=state.queueSpecialties.find(function(x){return String(x.id)===String(e.target.getAttribute("data-id"))});
      if(!specialty)return;
      $("queue-specialty-edit-id").value=specialty.id;
      $("queue-specialty-edit-name").value=specialty.name;
      $("queue-specialty-edit-dialog").showModal();
    }
    if(e.target.classList.contains("edit-queue-professional")){
      var professional=state.queueProfessionals.find(function(x){return String(x.id)===String(e.target.getAttribute("data-id"))});
      if(!professional)return;
      $("queue-professional-edit-id").value=professional.id;
      $("queue-professional-edit-name").value=professional.name;
      $("queue-professional-edit-specialty").innerHTML=activeQueueSpecialtyOptions(professional.specialty_id);
      $("queue-professional-edit-dialog").showModal();
    }
    if(e.target.classList.contains("toggle-queue-specialty")){
      try{await api("/api/queue/specialties/"+e.target.getAttribute("data-id"),{method:"PATCH",body:JSON.stringify({name:e.target.getAttribute("data-name"),active:e.target.getAttribute("data-active")!=="1"})});toast("Especialidade atualizada.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}
    }
    if(e.target.classList.contains("toggle-queue-professional")){
      try{await api("/api/queue/professionals/"+e.target.getAttribute("data-id"),{method:"PATCH",body:JSON.stringify({name:e.target.getAttribute("data-name"),specialty_id:e.target.getAttribute("data-specialty"),active:e.target.getAttribute("data-active")!=="1"})});toast("Profissional atualizado.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}
    }
  });
  $("queue-specialty-edit-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=$("queue-specialty-edit-id").value,x=state.queueSpecialties.find(function(row){return String(row.id)===String(id)});
    if(!x)return;
    normalizeNameInput($("queue-specialty-edit-name"));
    try{await api("/api/queue/specialties/"+id,{method:"PATCH",body:JSON.stringify({name:$("queue-specialty-edit-name").value,active:!!x.active})});$("queue-specialty-edit-dialog").close();toast("Especialidade atualizada.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}
  });
  $("queue-professional-edit-form").addEventListener("submit",async function(e){
    e.preventDefault();
    var id=$("queue-professional-edit-id").value,x=state.queueProfessionals.find(function(row){return String(row.id)===String(id)});
    if(!x)return;
    normalizeNameInput($("queue-professional-edit-name"));
    try{await api("/api/queue/professionals/"+id,{method:"PATCH",body:JSON.stringify({name:$("queue-professional-edit-name").value,specialty_id:$("queue-professional-edit-specialty").value,active:!!x.active})});$("queue-professional-edit-dialog").close();toast("Profissional atualizado.");loadQueueCatalogPage()}catch(err){toast(err.message,true)}
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
