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
  if(!pendingConfirmEmail){setAMsg('No saved email on file.');return;}
  setAuthLoading(true,'btnResendConfirm','Resending\u2026','Resend email');
  try{
    await Auth.resendConfirmationEmail(pendingConfirmEmail);
    setAMsg('Confirmation email resent. Check your spam folder too.',true);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnResendConfirm','Resending\u2026','Resend email');}
}
function getUsers(){try{return JSON.parse(localStorage.getItem('lc_users')||'{}');}catch(e){return{};}}
async function doRegister(){
  if(authBusy)return;
  const nm=document.getElementById('rName').value.trim(),em=document.getElementById('rEmail').value.trim(),pw=document.getElementById('rPass').value;
  if(!nm||!em||!pw){setAMsg('Fill all fields.');return;}
  if(pw.length<6){setAMsg('Min 6 chars.');return;}
  setAuthLoading(true,'btnRegister','Creating account…','Create Account →');
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
  finally{setAuthLoading(false,'btnRegister','Creating account…','Create Account →');}
}
async function doLogin(){
  if(authBusy)return;
  const em=document.getElementById('lEmail').value.trim(),pw=document.getElementById('lPass').value;
  if(!em||!pw){setAMsg('Fill all fields.');return;}
  setAuthLoading(true,'btnLogin','Signing in…','Sign In →');
  try{
    await Auth.login(em,pw);
    Auth.clearGuest();
    updUserBtn();
    setAMsg('Welcome back!',true);
    setTimeout(()=>{closeAuth();},600);
  }catch(e){setAMsg(e.message);}
  finally{setAuthLoading(false,'btnLogin','Signing in…','Sign In →');}
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
  if(typeof syncAppPlan==='function')syncAppPlan();
  const guest=(typeof Auth!=='undefined'&&Auth.isGuest&&Auth.isGuest())||!S.user||S.user.email==='guest@lexicoil.com'||(typeof isAppAuthenticated==='function'&&!isAppAuthenticated());
  const plan=typeof resolveAppPlan==='function'?resolveAppPlan():(S.plan||'free');
  const pro=plan==='pro'||plan==='pro_max';
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
  function setMenuBtn(el,visible){
    if(!el)return;
    el.hidden=!visible;
    el.style.display=visible?'':'none';
  }
  if(guest){
    nameEl.textContent='Guest mode';
    emailEl.textContent='Progress saved on this device only';
    planEl.textContent='Guest';
    planEl.className='user-dropdown__plan user-dropdown__plan--guest';
    metaEl.textContent=`${qUsed}/${qMax} AI tries used. Create a free account to sync across devices.`;
    setMenuBtn(upBtn,false);
    setMenuBtn(subBtn,false);
    setMenuBtn(inBtn,true);
    setMenuBtn(outBtn,false);
    if(outSep)outSep.hidden=true;
    const delBtn=document.getElementById('udDeleteAccount');
    setMenuBtn(delBtn,false);
    return;
  }
  nameEl.textContent=S.user?.name||'Account';
  emailEl.textContent=S.user?.email||'';
  const planLbl=pro?(plan==='pro_max'?'Pro Max':'Pro'):(guest?'Guest':'Free');
  const adminLbl=S.user?.isAdmin?' · Admin':'';
  planEl.textContent=planLbl+adminLbl;
  planEl.className='user-dropdown__plan '+(pro?'user-dropdown__plan--pro':guest?'user-dropdown__plan--guest':'user-dropdown__plan--free');
  if(typeof accountPanelHtml==='function'){
    metaEl.innerHTML='<div class="user-dropdown__meta-rows">'+accountPanelHtml()+'</div>';
  }else{
    const qRem=Math.max(0,qMax-qUsed);
    let meta=`${qRem}/${qMax} exams left this month`;
    const aiSummary=typeof aiCreditsSummaryLabel==='function'?aiCreditsSummaryLabel():'';
    if(aiSummary)meta+=` · ${aiSummary}`;
    metaEl.textContent=meta;
  }
  setMenuBtn(upBtn,!pro);
  const canManageBilling=pro&&S.user?.billingSource!=='manual';
  setMenuBtn(subBtn,canManageBilling);
  setMenuBtn(inBtn,false);
  setMenuBtn(outBtn,true);
  const delBtn=document.getElementById('udDeleteAccount');
  setMenuBtn(delBtn,!S.user?.isAdmin);
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
  if(open){
    if(typeof syncAppPlan==='function')syncAppPlan();
    refreshUserDropdown();
  }
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
function openDeleteAccountModal(){
  closeUserMenu();
  const modal=document.getElementById('deleteAccountModal');
  const inp=document.getElementById('deleteAccountConfirm');
  const msg=document.getElementById('deleteAccountMsg');
  if(inp)inp.value='';
  if(msg){msg.textContent='';msg.className='auth-msg';}
  if(modal){modal.style.display='flex';modal.setAttribute('aria-hidden','false');}
  inp?.focus();
}
function closeDeleteAccountModal(){
  const modal=document.getElementById('deleteAccountModal');
  if(modal){modal.style.display='none';modal.setAttribute('aria-hidden','true');}
}
async function doDeleteAccount(){
  const inp=document.getElementById('deleteAccountConfirm');
  const msg=document.getElementById('deleteAccountMsg');
  const btn=document.getElementById('btnDeleteAccountConfirm');
  const phrase=(inp?.value||'').trim();
  if(phrase.toUpperCase()!=='ELIMINAR'){
    if(msg){msg.textContent='Type ELIMINAR exactly to confirm.';msg.className='auth-msg';}
    return;
  }
  if(btn){btn.disabled=true;btn.textContent='Deleting…';}
  try{
    await Auth.deleteAccount(phrase);
    closeDeleteAccountModal();
    if(typeof lcToast==='function')lcToast('Account deleted.','success',4000);
    window.location.href=marketingUrl();
  }catch(e){
    if(msg){msg.textContent=e.message||'Could not delete account.';msg.className='auth-msg';}
    if(btn){btn.disabled=false;btn.textContent='Delete my account permanently';}
  }
}
document.addEventListener('click',(ev)=>{
  const wrap=document.getElementById('userMenuWrap');
  if(wrap&&!wrap.contains(ev.target))closeUserMenu();
});
