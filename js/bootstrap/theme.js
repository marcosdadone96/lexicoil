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
  const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
  if(goal)return deckForGoal(goal);
  if(S.deckGoalFilter)return getDeckViewCards();
  const ap=typeof ExamProfile!=='undefined'?ExamProfile.getActive():null;
  if(ap){
    const pseudo={subject:ap.subject,level:ap.level};
    return(S.flashcards||[]).filter(f=>fcMatchesGoal(f,pseudo));
  }
  return S.flashcards||[];
}
function getProfileHistory(){
  const goal=(typeof getActiveGoal==='function')?getActiveGoal():null;
  if(goal)return historyForGoal(goal);
  const ap=typeof ExamProfile!=='undefined'?ExamProfile.getActive():null;
  if(ap)return(S.history||[]).filter(h=>h.lang===ap.subject&&h.level===ap.level);
  return S.history||[];
}
