export default async () => {
  const provider = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();
  const whatsapp =
    provider === 'meta'
      ? Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID)
      : Boolean(
          process.env.EVOLUTION_API_URL &&
            process.env.EVOLUTION_INSTANCE &&
            process.env.EVOLUTION_API_KEY
        );
  return Response.json({ ok: true, whatsapp, provider, ambiente: 'netlify' });
};
