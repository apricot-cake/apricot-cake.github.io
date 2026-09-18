import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ base: './content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			category: z.enum(['apps']),
			description: z.string().optional(),
			cardUrl: z.string().url().optional(),
			cardLinkLabel: z.string().optional(),
			// Transform string to Date object
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
		}),
});

const pages = defineCollection({
	loader: glob({ base: './content/pages', pattern: '**/*.{md,mdx}' }),
	schema: z.object({ title: z.string() }),
});

export const collections = { blog, pages };
