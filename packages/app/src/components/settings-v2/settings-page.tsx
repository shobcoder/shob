import { Component } from "solid-js"
import { TabsV2 } from "@shob/ui/v2/tabs-v2"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { SettingsGeneralV2 } from "./general"
import { SettingsKeybinds } from "../settings-keybinds"
import { SettingsProvidersV2 } from "./providers"
import { SettingsModelsV2 } from "./models"
import { SettingsAboutV2 } from "./about"
import { SettingsSkillsV2 } from "./skills"
import "./settings-v2.css"
import { SettingsServersV2 } from "./servers"

const SidebarGeneralIcon: Component = () => (
  <svg viewBox="0 0 36 36" aria-hidden="true">
    <path
      fill="currentColor"
      d="M18.1,11c-3.9,0-7,3.1-7,7s3.1,7,7,7c3.9,0,7-3.1,7-7S22,11,18.1,11z M18.1,23c-2.8,0-5-2.2-5-5s2.2-5,5-5c2.8,0,5,2.2,5,5S20.9,23,18.1,23z"
    />
    <path
      fill="currentColor"
      d="M32.8,14.7L30,13.8l-0.6-1.5l1.4-2.6c0.3-0.6,0.2-1.4-0.3-1.9l-2.4-2.4c-0.5-0.5-1.3-0.6-1.9-0.3l-2.6,1.4l-1.5-0.6l-0.9-2.8C21,2.5,20.4,2,19.7,2h-3.4c-0.7,0-1.3,0.5-1.4,1.2L14,6c-0.6,0.1-1.1,0.3-1.6,0.6L9.8,5.2C9.2,4.9,8.4,5,7.9,5.5L5.5,7.9C5,8.4,4.9,9.2,5.2,9.8l1.3,2.5c-0.2,0.5-0.4,1.1-0.6,1.6l-2.8,0.9C2.5,15,2,15.6,2,16.3v3.4c0,0.7,0.5,1.3,1.2,1.5L6,22.1l0.6,1.5l-1.4,2.6c-0.3,0.6-0.2,1.4,0.3,1.9l2.4,2.4c0.5,0.5,1.3,0.6,1.9,0.3l2.6-1.4l1.5,0.6l0.9,2.9c0.2,0.6,0.8,1.1,1.5,1.1h3.4c0.7,0,1.3-0.5,1.5-1.1l0.9-2.9l1.5-0.6l2.6,1.4c0.6,0.3,1.4,0.2,1.9-0.3l2.4-2.4c0.5-0.5,0.6-1.3,0.3-1.9l-1.4-2.6l0.6-1.5l2.9-0.9c0.6-0.2,1.1-0.8,1.1-1.5v-3.4C34,15.6,33.5,14.9,32.8,14.7z M32,19.4l-3.6,1.1L28.3,21c-0.3,0.7-0.6,1.4-0.9,2.1l-0.3,0.5l1.8,3.3l-2,2l-3.3-1.8l-0.5,0.3c-0.7,0.4-1.4,0.7-2.1,0.9l-0.5,0.1L19.4,32h-2.8l-1.1-3.6L15,28.3c-0.7-0.3-1.4-0.6-2.1-0.9l-0.5-0.3l-3.3,1.8l-2-2l1.8-3.3l-0.3-0.5c-0.4-0.7-0.7-1.4-0.9-2.1l-0.1-0.5L4,19.4v-2.8l3.4-1l0.2-0.5c0.2-0.8,0.5-1.5,0.9-2.2l0.3-0.5L7.1,9.1l2-2l3.2,1.8l0.5-0.3c0.7-0.4,1.4-0.7,2.2-0.9l0.5-0.2L16.6,4h2.8l1.1,3.5L21,7.7c0.7,0.2,1.4,0.5,2.1,0.9l0.5,0.3l3.3-1.8l2,2l-1.8,3.3l0.3,0.5c0.4,0.7,0.7,1.4,0.9,2.1l0.1,0.5l3.6,1.1V19.4z"
    />
  </svg>
)

const SidebarShortcutsIcon: Component = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M16.5 20.75H7.5C6.75 20.75 6.2 20.72 5.73 20.65C2.41 20.29 1.75 18.3 1.75 15V9C1.75 5.7 2.41 3.71 5.76 3.34C6.2 3.28 6.75 3.25 7.5 3.25H16.5C17.25 3.25 17.8 3.28 18.27 3.35C21.59 3.71 22.25 5.7 22.25 9V15C22.25 18.3 21.59 20.29 18.24 20.66C17.8 20.72 17.25 20.75 16.5 20.75ZM7.5 4.75C6.82 4.75 6.34 4.78 5.95 4.83C3.92 5.06 3.25 5.69 3.25 9V15C3.25 18.31 3.92 18.94 5.92 19.17C6.34 19.23 6.82 19.25 7.5 19.25H16.5C17.18 19.25 17.66 19.22 18.05 19.17C20.08 18.95 20.75 18.31 20.75 15V9C20.75 5.69 20.08 5.06 18.08 4.83C17.66 4.77 17.18 4.75 16.5 4.75H7.5Z"
    />
    <path fill="currentColor" d="M17 10.75H13.5C13.09 10.75 12.75 10.41 12.75 10C12.75 9.59 13.09 9.25 13.5 9.25H17C17.41 9.25 17.75 9.59 17.75 10C17.75 10.41 17.41 10.75 17 10.75Z" />
    <path fill="currentColor" d="M10.1001 11C9.5501 11 9.1001 10.55 9.1001 10C9.1001 9.45 9.5401 9 10.1001 9H10.1101C10.6601 9 11.1101 9.45 11.1101 10C11.1101 10.55 10.6601 11 10.1001 11Z" />
    <path fill="currentColor" d="M7.1001 11C6.5501 11 6.1001 10.55 6.1001 10C6.1001 9.45 6.5401 9 7.1001 9C7.6501 9 8.1001 9.45 8.1001 10C8.1001 10.55 7.6601 11 7.1001 11Z" />
    <path fill="currentColor" d="M17 16.25H7.02001C6.61001 16.25 6.26001 15.91 6.26001 15.5C6.26001 15.09 6.59001 14.75 7.00001 14.75H17C17.41 14.75 17.75 15.09 17.75 15.5C17.75 15.91 17.41 16.25 17 16.25Z" />
  </svg>
)

const SidebarServersIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    <line x1="6" y1="6" x2="6.01" y2="6" />
    <line x1="6" y1="18" x2="6.01" y2="18" />
  </svg>
)

const SidebarProvidersIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3.29701 5.2338C3.52243 4.27279 4.27279 3.52243 5.2338 3.29701C6.06663 3.10165 6.93337 3.10165 7.7662 3.29701C8.72721 3.52243 9.47757 4.27279 9.70299 5.2338C9.89835 6.06663 9.89835 6.93337 9.70299 7.7662C9.47757 8.72721 8.72721 9.47757 7.7662 9.70299C6.93337 9.89835 6.06663 9.89835 5.2338 9.70299C4.27279 9.47757 3.52243 8.72721 3.29701 7.7662C3.10166 6.93337 3.10166 6.06663 3.29701 5.2338Z" stroke="currentColor" stroke-width="1.5" />
    <path d="M3.29701 16.2338C3.52243 15.2728 4.27279 14.5224 5.2338 14.297C6.06663 14.1017 6.93337 14.1017 7.7662 14.297C8.72721 14.5224 9.47757 15.2728 9.70299 16.2338C9.89835 17.0666 9.89835 17.9334 9.70299 18.7662C9.47757 19.7272 8.72721 20.4776 7.7662 20.703C6.93337 20.8983 6.06663 20.8983 5.2338 20.703C4.27279 20.4776 3.52243 19.7272 3.29701 18.7662C3.10166 17.9334 3.10166 17.0666 3.29701 16.2338Z" stroke="currentColor" stroke-width="1.5" />
    <path d="M14.297 5.2338C14.5224 4.27279 15.2728 3.52243 16.2338 3.29701C17.0666 3.10165 17.9334 3.10165 18.7662 3.29701C19.7272 3.52243 20.4776 4.27279 20.703 5.2338C20.8983 6.06663 20.8983 6.93337 20.703 7.7662C20.4776 8.72721 19.7272 9.47757 18.7662 9.70299C17.9334 9.89835 17.0666 9.89835 16.2338 9.70299C15.2728 9.47757 14.5224 8.72721 14.297 7.7662C14.1017 6.93337 14.1017 6.06663 14.297 5.2338Z" stroke="currentColor" stroke-width="1.5" />
    <path d="M14.297 16.2338C14.5224 15.2728 15.2728 14.5224 16.2338 14.297C17.0666 14.1017 17.9334 14.1017 18.7662 14.297C19.7272 14.5224 20.4776 15.2728 20.703 16.2338C20.8983 17.0666 20.8983 17.9334 20.703 18.7662C20.4776 19.7272 19.7272 20.4776 18.7662 20.703C17.9334 20.8983 17.0666 20.8983 16.2338 20.703C15.2728 20.4776 14.5224 19.7272 14.297 18.7662C14.1017 17.9334 14.1017 17.0666 14.297 16.2338Z" stroke="currentColor" stroke-width="1.5" />
  </svg>
)

const SidebarModelsIcon: Component = () => (
  <svg viewBox="0 0 50 50" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 6 Q21 21 36 21 Q21 21 21 36 Q21 21 6 21 Q21 21 21 6 Z" />
    <path d="M38 26 Q38 33 45 33 Q38 33 38 40 Q38 33 31 33 Q38 33 38 26 Z" />
  </svg>
)

const SidebarAboutIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"></circle>
    <line x1="12" y1="16" x2="12" y2="12"></line>
    <line x1="12" y1="8" x2="12.01" y2="8"></line>
  </svg>
)

const SidebarSkillsIcon: Component = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
  </svg>
)

export const SettingsPage: Component<{
  sessionID?: string
}> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()

  return (
    <div class="settings-v2-page">
      <TabsV2 orientation="vertical" variant="settings" defaultValue="general" class="settings-v2">
        <TabsV2.List>
          <div class="flex flex-col justify-between h-full w-full">
            <div class="flex flex-col gap-3 w-full">
              <div class="flex flex-col gap-1.5 w-full">
                <TabsV2.Trigger value="general">
                  <SidebarGeneralIcon />
                  {language.t("settings.tab.general")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="shortcuts">
                  <SidebarShortcutsIcon />
                  {language.t("settings.tab.shortcuts")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="servers">
                  <SidebarServersIcon />
                  {language.t("status.popover.tab.servers")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="providers">
                  <SidebarProvidersIcon />
                  {language.t("settings.providers.title")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="models">
                  <SidebarModelsIcon />
                  {language.t("settings.models.title")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="skills">
                  <SidebarSkillsIcon />
                  {language.t("settings.tab.skills")}
                </TabsV2.Trigger>
                <TabsV2.Trigger value="about">
                  <SidebarAboutIcon />
                  About
                </TabsV2.Trigger>
              </div>
            </div>
            <div class="settings-v2-nav-footer">
              <span>{language.t("app.name.desktop")}</span>
              <span>v{platform.version}</span>
            </div>
          </div>
        </TabsV2.List>
        <TabsV2.Content value="general" class="settings-v2-panel">
          <SettingsGeneralV2 sessionID={props.sessionID} />
        </TabsV2.Content>
        <TabsV2.Content value="shortcuts" class="settings-v2-panel">
          <SettingsKeybinds v2 />
        </TabsV2.Content>
        <TabsV2.Content value="servers" class="settings-v2-panel">
          <SettingsServersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="providers" class="settings-v2-panel">
          <SettingsProvidersV2 />
        </TabsV2.Content>
        <TabsV2.Content value="models" class="settings-v2-panel">
          <SettingsModelsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="skills" class="settings-v2-panel">
          <SettingsSkillsV2 />
        </TabsV2.Content>
        <TabsV2.Content value="about" class="settings-v2-panel">
          <SettingsAboutV2 />
        </TabsV2.Content>
      </TabsV2>
    </div>
  )
}
