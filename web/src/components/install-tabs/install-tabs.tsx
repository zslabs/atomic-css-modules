import { CodeBlock } from '@/components/code-block/code-block'
import {
  SelectionIndicator,
  Tab,
  TabList,
  TabPanel,
  Tabs,
} from 'react-aria-components'
import { SNIPPETS } from 'virtual:code-snippets'
import styles from './install-tabs.module.css'

export function InstallTabs() {
  return (
    <Tabs defaultSelectedKey="vite">
      <TabList aria-label="Setup" className={styles.list}>
        <SetupTab id="vite">Vite</SetupTab>
        <SetupTab id="rspack">Rspack</SetupTab>
        <SetupTab id="postcss">PostCSS</SetupTab>
      </TabList>
      <TabPanel id="vite">
        <CodeBlock snippet={SNIPPETS.viteConfig} filename="vite.config.ts" />
      </TabPanel>
      <TabPanel id="rspack">
        <CodeBlock
          snippet={SNIPPETS.rspackConfig}
          filename="rspack.config.ts"
        />
      </TabPanel>
      <TabPanel id="postcss">
        <CodeBlock
          snippet={SNIPPETS.postcssConfig}
          filename="postcss.config.js"
        />
        <CodeBlock
          snippet={SNIPPETS.postcssGlobals}
          filename="app/globals.css"
        />
      </TabPanel>
    </Tabs>
  )
}

function SetupTab({ id, children }: { id: string; children: string }) {
  return (
    <Tab id={id} className={styles.tab}>
      <span className={styles.label}>{children}</span>
      <SelectionIndicator className={styles.pill} />
    </Tab>
  )
}
