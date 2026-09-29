declare module '*.css'
declare module '*.png'
declare module '*?url' {
  const src: string
  export default src
}
