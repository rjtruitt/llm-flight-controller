/**
 * Content Block Types - Individual content components for messages
 */

/**
 * Text content block
 */
export interface TextContent {
    type: 'text';
    text: string;
}

/**
 * Image content block
 */
export interface ImageContent {
    type: 'image';
    /** Image URL or data URI */
    url?: string;
    /** MIME type (e.g., 'image/png', 'image/jpeg') */
    mimeType?: string;
    /** Image source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Audio content block
 */
export interface AudioContent {
    type: 'audio';
    /** Audio URL or data URI */
    url?: string;
    /** MIME type (e.g., 'audio/wav', 'audio/mp3') */
    mimeType?: string;
    /** Audio source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Video content block
 */
export interface VideoContent {
    type: 'video';
    /** Video URL or data URI */
    url?: string;
    /** MIME type (e.g., 'video/mp4', 'video/webm') */
    mimeType?: string;
    /** Video source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}

/**
 * Document content block (PDFs, etc.)
 */
export interface DocumentContent {
    type: 'document';
    /** Document URL or data URI */
    url?: string;
    /** MIME type (e.g., 'application/pdf') */
    mimeType?: string;
    /** Document source (for base64 data) */
    source?: {
        type: 'base64' | 'url';
        media_type?: string;
        mediaType?: string;
        data?: string;
    };
}
