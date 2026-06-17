/** Supabase browser client  single instance, URL/anon key from auth-config. */

const SupabaseAuth = (() => {

  let client = null;

  let cachedUrl = '';

  let cachedKey = '';

  let siteUrl = 'https://lexicoil.com';



  function getCanonicalOrigin() {

    if (typeof window !== 'undefined' && window.location && window.location.hostname) {

      return window.location.origin.replace(/\/$/, '');

    }

    const fromConfig = String(siteUrl || '').replace(/\/$/, '');

    if (fromConfig && !/tu-sitio|placeholder/i.test(fromConfig)) return fromConfig;

    return 'https://lexicoil.com';

  }



  function getSiteUrl() {

    return getCanonicalOrigin();

  }



  function getOAuthRedirectUrl() {

    return `${getCanonicalOrigin()}/app.html`;

  }



  function getEmailRedirectUrl() {

    return `${getCanonicalOrigin()}/confirmacion`;

  }



  async function init(config) {

    const url = config?.supabaseUrl || '';

    const key = config?.supabaseAnonKey || '';

    if (config?.siteUrl) siteUrl = config.siteUrl;

    if (!url || !key) {

      client = null;

      cachedUrl = '';

      cachedKey = '';

      return null;

    }

    if (client && cachedUrl === url && cachedKey === key) {

      return client;

    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.8');

    cachedUrl = url;

    cachedKey = key;

    client = createClient(url, key, {

      auth: {

        persistSession: true,

        autoRefreshToken: true,

        detectSessionInUrl: false,

        flowType: 'pkce',

        storageKey: 'lc-supabase-auth',

        storage: typeof window !== 'undefined' ? window.localStorage : undefined,

      },

    });

    return client;

  }



  function getClient() {

    return client;

  }



  function isReady() {

    return Boolean(client);

  }



  return {

    init,

    getClient,

    isReady,

    getSiteUrl,

    getOAuthRedirectUrl,

    getEmailRedirectUrl,

    getCanonicalOrigin,

  };

})();

