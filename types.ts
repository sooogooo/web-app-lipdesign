export interface Photo {
  id: string;
  name: string;
  url: string; // base64 data URL
  compliance: {
    isCompliant: boolean;
    reason?: string;
  } | null;
  lipCloseup?: string; // base64 data URL
}

export interface OperationHistory {
  id: string;
  timestamp: number;
  type: 'style' | 'suggestion' | 'text' | 'nine-grid';
  prompt: string;
  resultUrl: string; // base64 data URL
}

export interface AestheticPlan {
  injectionPlan: string;
  volumeAndShapePlan: string;
  lipLinerPlan: string;
  makeupPlan: string;
}
