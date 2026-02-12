import { defineCollection, z } from 'astro:content';

const reviewsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    // 기본 정보
    title: z.string(),
    description: z.string(),
    publishedAt: z.string(),
    updatedAt: z.string().optional(),
    author: z.string().default('TechPulse'),

    // 제품 정보
    product: z.object({
      name: z.string(),
      brand: z.string(),
      category: z.enum(['laptop', 'smartphone', 'gadget']),
      image: z.string(),
      releaseDate: z.string().optional(),
    }),

    // 점수 정보
    scores: z.object({
      performance: z.number().min(0).max(100),
      design: z.number().min(0).max(100),
      display: z.number().min(0).max(100),
      battery: z.number().min(0).max(100),
      value: z.number().min(0).max(100),
    }),

    // 가격 정보
    prices: z.array(z.object({
      vendor: z.string(),
      price: z.number(),
      url: z.string().url(),
      shipping: z.string().optional(),
      badge: z.string().optional(),
    })),

    // 스펙 정보
    specs: z.array(z.object({
      category: z.string(),
      icon: z.string().optional(),
      specs: z.array(z.object({
        label: z.string(),
        value: z.string(),
        highlight: z.boolean().optional(),
      })),
    })),

    // SEO
    keywords: z.string().optional(),
    ogImage: z.string().optional(),

    // 기타
    featured: z.boolean().default(false),
    rank: z.number().optional(),
  }),
});

export const collections = {
  'reviews': reviewsCollection,
};
