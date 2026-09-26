declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css?url' {
  const href: string
  export default href
}

declare module '*.svg?url' {
  const href: string
  export default href
}
