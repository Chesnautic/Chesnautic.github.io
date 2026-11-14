// Content Studio App settings (public values only; secrets live in the Vercel project settings)
window.STUDIO = {
  clientKey: "sbawsm96wmbjedk6u8",            // TikTok app client key (sandbox while in review; swap for the production key once approved)
  api: "",                                    // same site: contentstudioapp.vercel.app/api/...
  redirectUri: "https://contentstudioapp.vercel.app/studio/callback",
  scopes: "user.info.basic,video.publish,video.upload",
};
