export interface ImageState {
  src: string;
  alt?: string;
  caption?: string;
}

export interface ImageConfig {
  fit?: 'contain' | 'cover' | 'fill';
}

export const defaultImageState = (): ImageState => ({
  src: '',
  alt: '',
  caption: '',
});

export const defaultImageConfig = (): ImageConfig => ({
  fit: 'cover',
});
