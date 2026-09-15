export type AiAgentName =
  | 'customer'
  | 'reply'
  | 'sales'
  | 'follow_up'
  | 'summary'
  | 'classification'
  | 'insight';

export type AiRequest = {
  agent: AiAgentName;
  input: string;
  context?: Record<string, unknown>;
};

export type AiResult = {
  agent: AiAgentName;
  output: string;
  confidence: number;
  actions: string[];
  provider: 'rules';
};

export type AiOrchestratorResult = {
  agent: 'orchestrator';
  intent: 'SALES_INTENT' | 'SUPPORT_INTENT' | 'GENERAL_INTENT';
  confidence: number;
  outputs: AiResult[];
  recommendedActions: string[];
  provider: 'rules';
};

const normalize = (value: string) => value.trim().toLowerCase();

export function runAi(request: AiRequest): AiResult {
  const input = normalize(request.input);
  let output = 'Permintaan dipahami dan siap diproses oleh ORYN.';
  let actions: string[] = [];
  let confidence = 0.7;

  switch (request.agent) {
    case 'classification':
      output = input.includes('harga') || input.includes('beli') || input.includes('pesan')
        ? 'SALES_INTENT'
        : input.includes('keluhan') || input.includes('komplain') || input.includes('rusak')
          ? 'SUPPORT_INTENT'
          : 'GENERAL_INTENT';
      confidence = 0.82;
      break;
    case 'reply':
      output = 'Terima kasih sudah menghubungi kami. Saya akan membantu menindaklanjuti kebutuhan Anda.';
      actions = ['review_reply', 'send_when_approved'];
      break;
    case 'sales':
      output = 'Peluang penjualan perlu dinilai berdasarkan kebutuhan, nilai, tahap lead, dan aktivitas terakhir pelanggan.';
      actions = ['score_lead', 'suggest_next_step'];
      break;
    case 'follow_up':
      output = 'Sarankan follow-up berdasarkan prioritas lead dan waktu aktivitas terakhir, dengan menjaga frekuensi komunikasi tetap wajar.';
      actions = ['create_follow_up_candidate'];
      break;
    case 'summary':
      output = request.input ? `Ringkasan konteks: ${request.input.slice(0, 500)}` : 'Belum ada konteks untuk diringkas.';
      break;
    case 'customer':
      output = 'Customer 360 siap digunakan untuk memahami profil, riwayat percakapan, lead, tugas, dan segmentasi pelanggan.';
      actions = ['load_customer_360'];
      break;
    case 'insight':
      output = 'ORYN mendeteksi kebutuhan untuk memprioritaskan pelanggan dan aktivitas dengan potensi dampak bisnis tertinggi.';
      actions = ['rank_opportunities', 'refresh_dashboard'];
      break;
  }

  return { agent: request.agent, output, confidence, actions, provider: 'rules' };
}

export function runAiOrchestrator(input: string, context?: Record<string, unknown>): AiOrchestratorResult {
  const classification = runAi({ agent: 'classification', input, context });
  const intent = classification.output as AiOrchestratorResult['intent'];
  const selectedAgents: AiAgentName[] = intent === 'SALES_INTENT'
    ? ['customer', 'sales', 'follow_up', 'reply']
    : intent === 'SUPPORT_INTENT'
      ? ['customer', 'summary', 'reply']
      : ['customer', 'summary', 'insight'];

  const outputs = selectedAgents.map(agent => runAi({ agent, input, context }));
  const recommendedActions = [...new Set([
    ...classification.actions,
    ...outputs.flatMap(result => result.actions),
  ])];
  const confidence = outputs.length
    ? Math.min(0.98, (classification.confidence + outputs.reduce((sum, result) => sum + result.confidence, 0)) / (outputs.length + 1))
    : classification.confidence;

  return { agent: 'orchestrator', intent, confidence, outputs, recommendedActions, provider: 'rules' };
}
