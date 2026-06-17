// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
window.initPromise=null;
async function init(){
  if(!window.initPromise)window.initPromise=runInit();
  return window.initPromise;
}
async function runInit(){
  try{
    localStorage.removeItem('lc_demo');
    localStorage.removeItem('lc_guest');
    if(typeof Auth!=='undefined'&&Auth.clearGuest)Auth.clearGuest();
  }catch(_){}
  hideAuthOverlay();
  try{loadLS();}catch(e){lcDebug.warn('[loadLS]',e);}
  try{
    if(typeof ManualVocab!=='undefined'&&typeof ManualVocab.reclassifyStoredFlashcards==='function'){
      if(ManualVocab.reclassifyStoredFlashcards()&&typeof saveFC==='function')saveFC();
    }
  }catch(e){lcDebug.warn('[vocab reclass]',e);}
  try{
    if(typeof BurnedRegistry!=='undefined'&&typeof BurnedRegistry.setCooldownDays==='function'){
      BurnedRegistry.setCooldownDays(window.LC_COOLDOWN_DAYS??15);
    }
  }catch(e){lcDebug.warn('[burned cooldown]',e);}
  try{
    if(typeof LibraryLoader!=='undefined'&&LibraryLoader.probeAll){
      await LibraryLoader.probeAll();
    }
  }catch(e){lcDebug.warn('[library probe]',e);}
  try{
    if(typeof renderProfileLevelGrid==='function')renderProfileLevelGrid();
  }catch(e){lcDebug.warn('[level probe refresh]',e);}
  try{migrateSavedExams();}catch(e){lcDebug.warn('[migrateSavedExams]',e);S.savedExams=[];}
  loadTheme();
  paintDashboard();
  const oauthReturn=/[?&]code=/.test(location.search)||/access_token|refresh_token/i.test(location.hash||'');
  let oauthMsg=null;

  let ok=await bootstrapAuth(8000);
  if(!ok&&oauthReturn&&typeof Auth!=='undefined'){
    try{
      await Auth.completeOAuthCallback();
      ok=await bootstrapAuth(8000);
    }catch(e){
      oauthMsg=e.message||'Could not sign in.';
    }
  }
  if(typeof Auth!=='undefined'&&Auth.isGuest&&Auth.isGuest()){
    if(Auth.clearGuest)Auth.clearGuest();
    S.user=null;
    ok=false;
  }

  updUserBtn();
  if(typeof refreshUserDropdown==='function')refreshUserDropdown();
  try{
    if(typeof AnalyticsStore!=='undefined'&&typeof AnalyticsStore.runMasteryIntegrityFix==='function'){
      AnalyticsStore.runMasteryIntegrityFix();
    }
    if(typeof ManualVocab!=='undefined'&&typeof ManualVocab.reclassifyStoredFlashcards==='function'){
      if(ManualVocab.reclassifyStoredFlashcards()&&typeof saveFC==='function')saveFC();
    }
  }catch(e){lcDebug.warn('[post-sync fix]',e);}
  if(oauthMsg){
    lcDebug.warn('[auth] OAuth on load:',oauthMsg);
  }
  updBadges();updQuotaUI();
  const lp=new URLSearchParams(location.search);
  if(lp.get('demo')==='1'||lp.get('try')==='1'){
    location.replace('/demo');
    return;
  }
  const authMode=lp.get('auth');
  if(authMode==='login'||authMode==='register'){
    history.replaceState({},'',location.pathname);
    if(!isAppAuthenticated()){
      switchTab(authMode);
      showAuthOverlay();
      show('homeScreen');
      renderHomeScreen();
      return;
    }
  }
  if(authMode==='google'){
    history.replaceState({},'',location.pathname);
    if(!isAppAuthenticated()){
      showAuthOverlay();
      show('homeScreen');
      renderHomeScreen();
      setTimeout(()=>{if(typeof doGoogle==='function')doGoogle();},200);
      return;
    }
    history.replaceState({},'',location.pathname);
    show('homeScreen');
    renderHomeScreen();
    setTimeout(()=>{if(typeof doGoogle==='function')doGoogle();},200);
    return;
  }
  const deepLang=lp.get('lang');
  const deepLevel=lp.get('level');
  if(deepLang==='de'||deepLang==='en'||deepLang==='es'){
    if(!isAppAuthenticated()){
      history.replaceState({},'',location.pathname);
      switchTab('login');
      showAuthOverlay();
      show('homeScreen');
      renderHomeScreen();
      return;
    }
    history.replaceState({},'',location.pathname);
    hideAuthOverlay();
    if(deepLevel&&['A1','A2','B1','B2','C1','C2'].includes(deepLevel.toUpperCase())){
      const goal=findOrCreateGoal(deepLang,deepLevel.toUpperCase());
      if(goal)openGoalWorkspace(goal.id,'exams',true);
      return;
    }
    const existing=S.goals.find(g=>g.subject===deepLang);
    if(existing)openGoalWorkspace(existing.id,'exams',true);
    else{
      _goalWizard.subject=deepLang;
      _goalWizard.level='B1';
      showAddGoalWizard();
    }
    return;
  }
  if(!isAppAuthenticated()){
    switchTab('login');
    showAuthOverlay();
    show('homeScreen');
    renderHomeScreen();
    return;
  }
  hideAuthOverlay();
  if(parseAppRoute())return;
  show('homeScreen');
  renderHomeScreen();
}
function bootApp(){
  window.init().catch((e)=>{lcDebug.error('[init]',e);paintDashboard();});
}
window.bootApp=bootApp;
window.lcFixLocalData=function lcFixLocalData(){
  try{
    if(typeof AnalyticsStore!=='undefined')AnalyticsStore.runMasteryIntegrityFix();
    if(typeof ManualVocab!=='undefined'&&ManualVocab.reclassifyStoredFlashcards()){
      if(typeof saveFC==='function')saveFC();
    }
    if(typeof updQuotaUI==='function')updQuotaUI();
    if(typeof renderHomeScreen==='function')renderHomeScreen();
    if(typeof refreshVocabHubPanel==='function')refreshVocabHubPanel();
    console.log('[LexiCoil] Local data repaired. Reload if UI still looks stale.');
    return true;
  }catch(e){
    console.warn('[LexiCoil] lcFixLocalData failed',e);
    return false;
  }
};

(function(){
  const _origSetFcType=window.setFcTypeFilter;
  if(_origSetFcType)window.setFcTypeFilter=function(type,btn){S.fcSingleIdx=0;S.fcSingleFlipped=false;return _origSetFcType(type,btn);};
})();
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>window.bootApp());
}else{
  window.bootApp();
}
