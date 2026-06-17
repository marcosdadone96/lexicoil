// ═══════════════════════════════════════════
// THEME / UI
// ═══════════════════════════════════════════
function toggleTheme(){
  const l=document.body.classList.toggle('light');
  const theme=l?'light':'dark';
  document.documentElement.setAttribute('data-theme',theme);
  document.getElementById('themeBtn').textContent=l?'🌙':'☀️';
  localStorage.setItem('lc_theme',theme);
  localStorage.setItem('theme',theme);
}
function loadTheme(){
  const t=localStorage.getItem('theme')||localStorage.getItem('lc_theme')||'light';
  if(t==='light'){
    document.body.classList.add('light');
    document.documentElement.setAttribute('data-theme','light');
    document.getElementById('themeBtn').textContent='🌙';
  }else{
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('themeBtn').textContent='☀️';
  }
}
function getProfileFlashcards(){
  if(S.deckGoalFilter)return getDeckViewCards();
  return typeof ExamProfile!=='undefined'?ExamProfile.filterList(S.flashcards):S.flashcards;
}
function getProfileHistory(){
  return typeof ExamProfile!=='undefined'?ExamProfile.filterList(S.history):S.history;
}
