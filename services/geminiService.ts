// Implemented Gemini API services to replace placeholder content and fix related errors.
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AestheticPlan } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const dataUrlToPart = (dataUrl: string) => {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) {
        throw new Error("Invalid data URL format");
    }
    const [, mimeType, data] = match;
    return {
        inlineData: {
            mimeType,
            data,
        },
    };
};

const complianceSchema = {
    type: Type.OBJECT,
    properties: {
        isCompliant: { type: Type.BOOLEAN, description: "图片是否合规" },
        reason: { type: Type.STRING, description: "如果不合规，请提供简短的中文原因。" },
    },
    required: ['isCompliant'],
};

export const checkCompliance = async (photoUrl: string): Promise<{ isCompliant: boolean; reason?: string }> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    dataUrlToPart(photoUrl),
                    { text: "作为一名专业的医美顾问，请分析这张面部照片是否符合唇部美学设计的标准。标准要求：1. 图像清晰，无模糊。2. 正面拍摄，唇部居中。3. 表情自然，嘴唇闭合放松。4. 唇部无遮挡（如头发、手）。5. 光线均匀，无强烈阴影。请以JSON格式返回分析结果，并用中文说明不合规的原因。" }
                ]
            },
            config: { responseMimeType: "application/json", responseSchema: complianceSchema }
        });
        const result = JSON.parse(response.text);
        return { isCompliant: result.isCompliant, reason: result.reason };
    } catch (error) {
        console.error("合规性检查出错:", error);
        // Fallback data
        return { isCompliant: false, reason: "AI分析服务暂时出现问题，请稍后再试。" };
    }
};


export const extractLipCloseup = async (photoUrl: string): Promise<string | null> => {
     try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    dataUrlToPart(photoUrl),
                    { text: "请精确裁剪出这张图片中的唇部特写区域，包括嘴唇及紧邻的周边皮肤。确保裁剪后的图片清晰、居中。不要返回任何文字，只返回处理后的图片。" }
                ]
            },
            config: { responseModalities: [Modality.IMAGE] }
        });
        const firstPart = response.candidates?.[0]?.content?.parts[0];
        if (firstPart && firstPart.inlineData) {
            return `data:${firstPart.inlineData.mimeType};base64,${firstPart.inlineData.data}`;
        }
        return null;
    } catch (error) {
        console.error("唇部特写提取出错:", error);
        return null; // Don't return fallback image, let UI handle null
    }
};

const styleSuggestionsSchema = {
    type: Type.ARRAY,
    items: { type: Type.STRING }
};

export const getStyleSuggestions = async (lipCloseupUrl: string): Promise<string[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    dataUrlToPart(lipCloseupUrl),
                    { text: "根据这张唇部特写，请提供5个专业且富有创意的唇部美学设计建议（例如：“增加上唇饱满度，打造心形唇珠”）。以JSON数组的格式返回，仅包含字符串。" }
                ]
            },
            config: { responseMimeType: "application/json", responseSchema: styleSuggestionsSchema }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("获取风格建议出错:", error);
        return ["自然水润唇", "M型微笑唇", "饱满性感唇", "精致丘比特弓", "气质花瓣唇"];
    }
};

export const getQuickStyles = async (): Promise<string[]> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "请提供8个当前流行的唇部医美设计风格的名称（例如：“果冻唇”，“嘟嘟唇”）。以JSON数组的格式返回，仅包含字符串。",
            config: { responseMimeType: "application/json", responseSchema: styleSuggestionsSchema }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("获取快捷风格出错:", error);
        return ["水光唇", "M唇塑形", "唇珠点缀", "微笑唇角", "花瓣唇", "欧美唇", "经典唇形", "减龄唇"];
    }
};

export const applyStyle = async (photoUrl: string, prompt: string): Promise<string | null> => {
    try {
        const fullPrompt = `作为一名顶级的医美数字艺术家，请根据以下指令修改图片中的唇部：“${prompt}”。重要提示：你绝对不能修改面部的任何其他部分（如皮肤、鼻子、眼睛、下巴等），背景也必须保持完全不变。只对唇部进行修改，并保持原始图像的质感和光照。`;
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image-preview',
            contents: {
                parts: [
                    dataUrlToPart(photoUrl),
                    { text: fullPrompt }
                ]
            },
            config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (error) {
        console.error("应用风格出错:", error);
        return null;
    }
};

export const getNineGridSuggestions = async (lipCloseupUrl: string): Promise<string[] | null> => {
     try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    dataUrlToPart(lipCloseupUrl),
                    { text: "分析这张唇部特写，并生成9个不同但都符合美学标准的唇形设计风格描述。例如：“略微增加下唇容量，使唇形更丰满”或“锐化丘比特弓，打造精致唇峰”。请以JSON数组格式返回，确保数组长度为9。" }
                ]
            },
            config: { responseMimeType: "application/json", responseSchema: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 9, maxItems: 9 } }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("获取九宫格建议出错:", error);
        return Array(9).fill("AI建议生成失败");
    }
};

const aestheticPlanSchema = {
    type: Type.OBJECT,
    properties: {
        injectionPlan: { type: Type.STRING, description: "玻尿酸等软组织材料注射方案，包括层次、产品、方法。" },
        volumeAndShapePlan: { type: Type.STRING, description: "容量调整与形态优化方案，关于支撑和张力。" },
        lipLinerPlan: { type: Type.STRING, description: "唇线与纹色建议。" },
        makeupPlan: { type: Type.STRING, description: "口红与妆容修饰建议。" },
    },
    required: ["injectionPlan", "volumeAndShapePlan", "lipLinerPlan", "makeupPlan"],
};


export const getAestheticPlan = async (originalUrl: string, designedUrl: string): Promise<AestheticPlan | null> => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { text: "作为一名资深医美医生，请对比以下两张图片（图1为原始唇部，图2为设计后的效果），并根据从图1到图2的变化，提供一份专业、详细的美学方案。方案需包含四个方面，并以JSON格式返回：" },
                    dataUrlToPart(originalUrl),
                    { text: "图1：原始唇部" },
                    dataUrlToPart(designedUrl),
                    { text: "图2：设计效果" },
                ]
            },
            config: { responseMimeType: "application/json", responseSchema: aestheticPlanSchema }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("生成美学方案出错:", error);
        return {
            injectionPlan: "方案生成失败，请检查AI服务状态。",
            volumeAndShapePlan: "方案生成失败，请检查AI服务状态。",
            lipLinerPlan: "方案生成失败，请检查AI服务状态。",
            makeupPlan: "方案生成失败，请检查AI服务状态。",
        };
    }
};
