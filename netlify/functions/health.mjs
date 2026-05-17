export default async () => {
  const bridge = Boolean(process.env.WHATSAPP_BRIDGE_URL);
  return Response.json({
    ok: true,
    ambiente: 'netlify',
    whatsapp_modo: 'recepcao_envia_para_cliente',
    bridge_configurado: bridge,
    mensagem: bridge
      ? 'Site ligado ao PC da recepcao via ngrok'
      : 'Configure WHATSAPP_BRIDGE_URL no Netlify',
  });
};
