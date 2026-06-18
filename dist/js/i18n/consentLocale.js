/** Cookie consent UI strings (EU/CH). */
function resolveConsentLang() {
  try {
    const stored = localStorage.getItem('lc_ui_lang');
    if (stored && consentStrings(stored)) return stored;
  } catch (_) {}
  const nav = String(navigator.language || 'en').slice(0, 2).toLowerCase();
  if (nav === 'de' || nav === 'es' || nav === 'fr') return nav;
  return 'en';
}

function consentStrings(lang) {
  const L = {
    en: {
      title: 'Cookies & storage',
      body:
        'LexiCoil stores functional data in your browser (session, flashcards, exam progress). We do not use advertising trackers today. You can accept optional categories for future analytics, or continue with essential storage only.',
      accept: 'Accept all',
      reject: 'Reject optional',
      preferences: 'Preferences',
      privacyLink: 'Privacy policy',
      prefsTitle: 'Cookie preferences',
      prefsIntro: 'Essential storage is always active so the app works. Optional categories load only if you enable them.',
      catNecessary: 'Essential (required)',
      catNecessaryHint: 'Sign-in session, exam and flashcard state, theme, your consent choice.',
      catAnalytics: 'Analytics',
      catAnalyticsHint: 'Google Analytics — page views and usage patterns. Loads only if you enable this category.',
      catMarketing: 'Marketing',
      catMarketingHint: 'Not used today. Would only apply to optional promotional tools.',
      save: 'Save preferences',
      back: 'Back',
      closePrefs: 'Close preferences',
      alwaysOn: 'Always on',
      announceShown: 'Cookie consent banner shown.',
      announceSaved: 'Cookie preferences saved.',
    },
    de: {
      title: 'Cookies & Speicher',
      body:
        'LexiCoil speichert funktionale Daten in Ihrem Browser (Sitzung, Karteikarten, Prüfungsfortschritt). Derzeit keine Werbe-Tracker. Sie können optionale Kategorien für künftige Analysen akzeptieren oder nur mit notwendiger Speicherung fortfahren.',
      accept: 'Alle akzeptieren',
      reject: 'Optionale ablehnen',
      preferences: 'Einstellungen',
      privacyLink: 'Datenschutz',
      prefsTitle: 'Cookie-Einstellungen',
      prefsIntro:
        'Notwendige Speicherung ist immer aktiv, damit die App funktioniert. Optionale Kategorien werden nur bei Aktivierung geladen.',
      catNecessary: 'Notwendig (erforderlich)',
      catNecessaryHint: 'Anmeldesitzung, Prüfungs- und Karteikartenstatus, Design, Ihre Einwilligung.',
      catAnalytics: 'Analyse',
      catAnalyticsHint: 'Google Analytics — Seitenaufrufe und Nutzungsmuster. Wird nur geladen, wenn Sie diese Kategorie aktivieren.',
      catMarketing: 'Marketing',
      catMarketingHint: 'Derzeit nicht genutzt. Nur für optionale Werbetools.',
      save: 'Einstellungen speichern',
      back: 'Zurück',
      closePrefs: 'Einstellungen schließen',
      alwaysOn: 'Immer aktiv',
      announceShown: 'Cookie-Hinweis angezeigt.',
      announceSaved: 'Cookie-Einstellungen gespeichert.',
    },
    es: {
      title: 'Cookies y almacenamiento',
      body:
        'LexiCoil guarda datos funcionales en su navegador (sesión, tarjetas, progreso de exámenes). Hoy no usamos rastreadores publicitarios. Puede aceptar categorías opcionales para analítica futura o continuar solo con almacenamiento esencial.',
      accept: 'Aceptar todo',
      reject: 'Rechazar opcionales',
      preferences: 'Preferencias',
      privacyLink: 'Política de privacidad',
      prefsTitle: 'Preferencias de cookies',
      prefsIntro:
        'El almacenamiento esencial está siempre activo para que la app funcione. Las categorías opcionales solo se cargan si las activa.',
      catNecessary: 'Esenciales (obligatorio)',
      catNecessaryHint: 'Sesión, estado de exámenes y tarjetas, tema, su elección de consentimiento.',
      catAnalytics: 'Analítica',
      catAnalyticsHint: 'Google Analytics — visitas y uso del sitio. Solo se carga si activa esta categoría.',
      catMarketing: 'Marketing',
      catMarketingHint: 'No se usa hoy. Solo para herramientas promocionales opcionales.',
      save: 'Guardar preferencias',
      back: 'Volver',
      closePrefs: 'Cerrar preferencias',
      alwaysOn: 'Siempre activo',
      announceShown: 'Banner de cookies mostrado.',
      announceSaved: 'Preferencias de cookies guardadas.',
    },
    fr: {
      title: 'Cookies et stockage',
      body:
        'LexiCoil stocke des données fonctionnelles dans votre navigateur (session, flashcards, progression d’examens). Aucun traceur publicitaire aujourd’hui. Vous pouvez accepter des catégories optionnelles pour de futures analyses ou continuer avec le stockage essentiel uniquement.',
      accept: 'Tout accepter',
      reject: 'Refuser l’optionnel',
      preferences: 'Préférences',
      privacyLink: 'Politique de confidentialité',
      prefsTitle: 'Préférences cookies',
      prefsIntro:
        'Le stockage essentiel est toujours actif pour que l’app fonctionne. Les catégories optionnelles ne se chargent que si vous les activez.',
      catNecessary: 'Essentiels (requis)',
      catNecessaryHint: 'Session, état des examens et flashcards, thème, votre choix de consentement.',
      catAnalytics: 'Analytique',
      catAnalyticsHint: 'Google Analytics — pages vues et usage. Ne se charge que si vous activez cette catégorie.',
      catMarketing: 'Marketing',
      catMarketingHint: 'Non utilisé aujourd’hui. Uniquement pour des outils promotionnels optionnels.',
      save: 'Enregistrer',
      back: 'Retour',
      closePrefs: 'Fermer les préférences',
      alwaysOn: 'Toujours actif',
      announceShown: 'Bannière cookies affichée.',
      announceSaved: 'Préférences cookies enregistrées.',
    },
  };
  return L[lang] || L.en;
}

if (typeof window !== 'undefined') {
  window.consentStrings = consentStrings;
  window.resolveConsentLang = resolveConsentLang;
}
if (typeof module !== 'undefined') module.exports = { consentStrings, resolveConsentLang };
