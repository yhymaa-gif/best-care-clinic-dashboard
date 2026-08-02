(()=>{
  const key='bestcare_dashboard_theme_v1';
  let theme='light';
  try{
    const stored=localStorage.getItem(key);
    theme=stored==='dark'||stored==='light'?stored:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  }catch{}
  document.documentElement.dataset.theme=theme;
  document.documentElement.style.colorScheme=theme;
})();
