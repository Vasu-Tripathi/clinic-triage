/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pg', 'bcryptjs'],
  },
};
export default nextConfig;
