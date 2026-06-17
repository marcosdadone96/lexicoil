// ═══════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════
let authBusy=false;
function switchTab(t){
  hideAuthPending();
  document.querySelectorAll('.auth-tab').forEach((x,i)=>x.classList.toggle('active',(i===0&&t==='login')||(i===1&&t==='register')));
  document.getElementById('loginForm').style.display=t==='login'?'':'none';
  document.getElementById('registerForm').style.display=t==='register'?'':'none';
  document.getElementById('authMsg').textContent='';
}
function setAMsg(m,ok){const el=document.getElementById('authMsg');el.textContent=m;el.className='auth-msg'+(ok?' ok':'');}
function setAuthLoading(on,btnId,labelBusy,labelIdle){
  authBusy=on;
  const btn=document.getElementById(btnId);
  if(!btn)return;
  btn.disabled=on;
  btn.textContent=on?labelBusy:labelIdle;
}
function hideAuthPending(){
  const pending=document.getElementById('authPending');
  const wrap=document.getElementById('authFormsWrap');
  if(pending)pending.style.display='none';
  if(wrap)wrap.style.display='';
  document.querySelector('.auth-tabs')?.style.setProperty('display','');
}
let pendingConfirmEmail='';
function showAuthPending(email){
  pendingConfirmEmail=email||'';
  const pending=document.getElementById('authPending');
  const wrap=document.getElementById('authFormsWrap');
  const emailEl=document.getElementById('authPendingEmail');
  if(emailEl)emailEl.textContent=pendingConfirmEmail;
  if(wrap)wrap.style.display='none';
  document.querySelector('.auth-tabs')?.style.setProperty('display','none');
  if(pending)pending.style.display='block';
  setAMsg('',false);
}
function showAuthLoginFromPending(){
  hideAuthPending();
  switchTab('login');
}
async function doResendConfirmation(){
  if(!pendingConfirmEmail){setAMsg('No hay email guardado.');return;}
  setAuthLoading(true,'btnResendConfirm','Reenviando\u2026','Reenviar correo');
  try{
    await Auth.resendConfirmationEmail(pendingConfirmEmail);
    setAMsg('Correo reenviado. Revisa tambi\u00e9n spam.',true);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnResendConfirm','Reenviando\u2026','Reenviar correo');}
}
function getUsers(){try{return JSON.parse(localStorage.getItem('lc_users')||'{}');}catch(e){return{};}}
async function doRegister(){
  if(authBusy)return;
  const nm=document.getElementById('rName').value.trim(),em=document.getElementById('rEmail').value.trim(),pw=document.getElementById('rPass').value;
  if(!nm||!em||!pw){setAMsg('Fill all fields.');return;}
  if(pw.length<6){setAMsg('Min 6 chars.');return;}
  setAuthLoading(true,'btnRegister','Creando cuenta…','Create Account →');
  try{
    const result=await Auth.register(nm,em,pw);
    if(result&&result.pendingConfirmation){
      showAuthPending(result.email||em);
      return;
    }
    Auth.clearGuest();
    updUserBtn();
    setAMsg('Account created!',true);
    setTimeout(()=>{closeAuth();if(typeof ExamProfile!=='undefined'&&ExamProfile.needsOnboarding()&&!(typeof isFreeAccount==='function'&&isFreeAccount()))showProfileSetup();},600);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnRegister','Creando cuenta…','Create Account →');}
}
async function doLogin(){
  if(authBusy)return;
  const em=document.getElementById('lEmail').value.trim(),pw=document.getElementById('lPass').value;
  if(!em||!pw){setAMsg('Fill all fields.');return;}
  setAuthLoading(true,'btnLogin','Iniciando sesión…','Sign In →');
  try{
    await Auth.login(em,pw);
    Auth.clearGuest();
    updUserBtn();
    setAMsg('Welcome back!',true);
    setTimeout(()=>{closeAuth();},600);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnLogin','Iniciando sesión…','Sign In →');}
}
async function doForgotPassword(){
  const em=prompt('Enter your account email:');
  if(!em)return;
  setAuthLoading(true,'btnLogin','Sending…','Sign In →');
  try{
    const data=await Auth.forgotPassword(em.trim());
    setAMsg(data?.message||'If that email exists, a reset link was sent.',true);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnLogin','Sending…','Sign In →');}
}
function showResetPasswordForm(token){
  window._resetToken=token||'';
  showAuthOverlay();
  hideAuthPending();
  const wrap=document.getElementById('authFormsWrap');
  const rf=document.getElementById('resetForm');
  if(wrap)wrap.style.display='none';
  document.querySelector('.auth-tabs')?.style.setProperty('display','none');
  if(rf)rf.style.display='';
  setAMsg('',false);
}
async function doResetPassword(){
  const p1=document.getElementById('resetPass')?.value||'';
  const p2=document.getElementById('resetPass2')?.value||'';
  if(p1.length<6){setAMsg('Password must be at least 6 characters.');return;}
  if(p1!==p2){setAMsg('Passwords do not match.');return;}
  const token=window._resetToken;
  if(!token){setAMsg('Invalid reset link.');return;}
  setAuthLoading(true,'btnResetPass','Updating…','Update password →');
  try{
    const res=await fetch('/.netlify/functions/auth-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,password:p1})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error==='invalid_or_expired_token'?'This link expired. Request a new one.':(data.error||'Reset failed'));
    setAMsg('Password updated! Sign in with your new password.',true);
    document.getElementById('resetForm').style.display='none';
    document.getElementById('authFormsWrap').style.display='';
    document.querySelector('.auth-tabs')?.style.setProperty('display','');
    switchTab('login');
    window._resetToken=null;
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnResetPass','Updating…','Update password →');}
}
async function doGoogle(){
  if(authBusy)return;
  const btn=document.getElementById('btnGoogle');
  if(btn){btn.disabled=true;btn.style.opacity='0.65';}
  try{
    if(document.getElementById('registerForm')?.style.display!=='none'&&typeof savePendingCombo==='function'&&typeof readRegisterComboFromForm==='function'){
      savePendingCombo(readRegisterComboFromForm());
    }
    await Auth.signInWithGoogle();
  }catch(e){
    lcDebug.error('[auth] Google OAuth failed:',e);
    setAMsg(e.message||'Google sign-in failed.');
    if(btn){btn.disabled=false;btn.style.opacity='';}
  }
}
function marketingUrl(){return(location.hostname==='localhost'||location.hostname==='127.0.0.1')?'/':'https://lexicoil.com';}
function showAuthOverlay(){
  const ov=document.getElementById('authOverlay');
  if(!ov)return;
  ov.style.display='';
  ov.classList.add('open');
  ov.setAttribute('aria-hidden','false');
}
function hideAuthOverlay(){
  const ov=document.getElementById('authOverlay');
  if(!ov)return;
  ov.classList.remove('open');
  ov.style.display='none';
  ov.setAttribute('aria-hidden','true');
}
function restoreAppShellAfterAuth(){
  hideAuthOverlay();
  updUserBtn();
  updQuotaUI();
  if(typeof ExamProfile!=='undefined'&&ExamProfile.needsOnboarding()&&!(typeof isFreeAccount==='function'&&isFreeAccount())){
    showProfileSetup();
    return;
  }
  if(typeof goHome==='function')goHome();
}
function closeAuth(){
  if(!isAppAuthenticated())return;
  restoreAppShellAfterAuth();
}
function updUserBtn(){
  if(!S.user)return;
  document.getElementById('userAv').textContent=S.user.avatar||'?';
  const label=Auth.isGuest()?'Guest':(S.user.name||'Account').split(' ')[0];
  document.getElementById('userNm').textContent=label;
  refreshUserDropdown();
}
function refreshUserDropdown(){
  const guest=typeof Auth!=='undefined'&&Auth.isGuest&&Auth.isGuest();
  const pro=typeof isPro==='function'&&isPro();
  const qUsed=typeof getQuotaUsed==='function'?getQuotaUsed():0;
  const qMax=typeof getQuotaMax==='function'?getQuotaMax():2;
  const nameEl=document.getElementById('udName');
  const emailEl=document.getElementById('udEmail');
  const planEl=document.getElementById('udPlan');
  const metaEl=document.getElementById('udMeta');
  const upBtn=document.getElementById('udUpgrade');
  const subBtn=document.getElementById('udManageSub');
  const inBtn=document.getElementById('udSignIn');
  const outBtn=document.getElementById('udLogout');
  const outSep=document.getElementById('udLogoutSep');
  if(!nameEl)return;
  if(guest){
    nameEl.textContent='Guest mode';
    emailEl.textContent='Progress saved on this device only';
    planEl.textContent='Guest';
    planEl.className='user-dropdown__plan user-dropdown__plan--guest';
    metaEl.textContent=`${qUsed}/${qMax} AI tries used. Create a free account to sync across devices.`;
    if(upBtn)upBtn.hidden=true;
    if(subBtn)subBtn.hidden=true;
    if(inBtn)inBtn.hidden=false;
    if(outBtn)outBtn.hidden=true;
    if(outSep)outSep.hidden=true;
    return;
  }
  nameEl.textContent=S.user?.name||'Account';
  emailEl.textContent=S.user?.email||'';
  const planLbl=pro?'Pro':'Free';
  planEl.textContent=planLbl;
  planEl.className='user-dropdown__plan '+(pro?'user-dropdown__plan--pro':'user-dropdown__plan--free');
  let meta=`${qUsed}/${qMax} official mocks used this month.`;
  if(!pro&&typeof freeComboLabel==='function'&&typeof getFreeCombo==='function'&&getFreeCombo()){
    meta+=` Plan: ${freeComboLabel(getFreeCombo())}.`;
  }
  if(S.user?.memberSince){
    meta+=` Member since ${new Date(S.user.memberSince).toLocaleDateString()}.`;
  }
  metaEl.textContent=meta;
  if(upBtn)upBtn.hidden=pro;
  if(subBtn)subBtn.hidden=!pro;
  if(inBtn)inBtn.hidden=true;
  if(outBtn)outBtn.hidden=false;
  if(outSep)outSep.hidden=false;
}
function toggleUserMenu(ev){
  ev?.stopPropagation();
  const dd=document.getElementById('userDropdown');
  const btn=document.getElementById('userBtn');
  if(!dd||!btn)return;
  const open=dd.classList.toggle('open');
  dd.hidden=!open;
  btn.setAttribute('aria-expanded',open?'true':'false');
  if(open)refreshUserDropdown();
}
function closeUserMenu(){
  const dd=document.getElementById('userDropdown');
  const btn=document.getElementById('userBtn');
  if(dd){dd.classList.remove('open');dd.hidden=true;}
  if(btn)btn.setAttribute('aria-expanded','false');
}
function userMenuUpgrade(){closeUserMenu();showUpgrade();}
function userMenuManageSubscription(){
  closeUserMenu();
  if(typeof openStripePortal==='function')openStripePortal();
}
function userMenuSignIn(){
  closeUserMenu();
  hideAuthPending();
  switchTab('login');
  showAuthOverlay();
}
function goToLanding(){
  window.location.href=marketingUrl();
}
async function doLogout(){
  closeUserMenu();
  await Auth.logout();
  window.location.href=marketingUrl();
}
document.addEventListener('click',(ev)=>{
  const wrap=document.getElementById('userMenuWrap');
  if(wrap&&!wrap.contains(ev.target))closeUserMenu();
});
