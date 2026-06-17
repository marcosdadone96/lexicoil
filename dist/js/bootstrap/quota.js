// ═══════════════════════════════════════════
// QUOTA / PLAN
// ═══════════════════════════════════════════
function getMonthKey(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()}`;}
function getQuotaUsed(){
  try{const raw=localStorage.getItem('lc_quota');if(!raw)return 0;const q=JSON.parse(raw);return q.month===getMonthKey()?q.used:0;}catch(e){return 0;}
}
function incQuota(){
  const used=getQuotaUsed()+1;
  localStorage.setItem('lc_quota',JSON.stringify({month:getMonthKey(),used}));
  updQuotaUI();
  Auth.pushSync();
}
function isPro(){return typeof S!=='undefined'&&S.plan==='pro';}
function getQuotaMax(){
  if (typeof quotaMaxForPlan === 'function' && typeof S !== 'undefined') return quotaMaxForPlan(S.plan);
  return isPro() ? PRO_QUOTA : (typeof S !== 'undefined' && S.plan === 'guest' ? GUEST_QUOTA : FREE_QUOTA);
}
function canGenerate(){return getQuotaUsed()<getQuotaMax();}
function getQuotaRemaining(){return getQuotaMax()-getQuotaUsed();}
let _quotaConfirmCallback=null;
function confirmQuotaUse(onConfirm){
  if(getQuotaRemaining()!==1){onConfirm();return;}
  const used=getQuotaUsed(),max=getQuotaMax();
  const msg=document.getElementById('quotaConfirmMsg');
  if(msg){
    msg.innerHTML=`This is your <b>last exam</b> this month (${used}/${max} used). Use it now?`;
  }
  _quotaConfirmCallback=onConfirm;
  document.getElementById('quotaConfirmModal')?.classList.add('show');
}
function closeQuotaConfirm(){
  document.getElementById('quotaConfirmModal')?.classList.remove('show');
  _quotaConfirmCallback=null;
}
function acceptQuotaConfirm(){
  const cb=_quotaConfirmCallback;
  closeQuotaConfirm();
  if(cb)cb();
}
function updQuotaUI(){
  const used=getQuotaUsed(),max=getQuotaMax(),rem=max-used;
  const el=document.getElementById('quotaCount');
  const badge=document.getElementById('planBadgeHome');
  const upgradeBtn=document.getElementById('upgradeBtnHome');
  if(el){
    el.textContent=`${used}/${max} used`;
    el.className='quota-count'+(rem===0?' none':rem<=1?' low':'');
  }
  if(badge) badge.innerHTML=isPro()?'<span class="plan-badge plan-pro">✦ Pro</span>':'<span class="plan-badge plan-free">Free</span>';
  if(upgradeBtn) upgradeBtn.style.display=isPro()?'none':'inline-flex';
}
function showUpgrade(){document.getElementById('upgradeModal').classList.add('show');}
function closeUpgrade(){document.getElementById('upgradeModal').classList.remove('show');}
function activatePro(){
  alert('Stripe checkout is coming soon.\n\nCreate a free account now — your flashcards and progress sync to the cloud.');
  closeUpgrade();
}
