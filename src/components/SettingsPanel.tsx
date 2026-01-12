import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, X, Clock, Bell, Volume2, Loader2, CheckCircle, Mail, AlertCircle, Moon } from 'lucide-react';
import { VOICE_OPTIONS } from '../types';

interface SettingsPanelProps {
  refreshInterval: number;
  onRefreshIntervalChange: (interval: number) => void;
  defaultTheme: 'light' | 'dark';
  onDefaultThemeChange: (theme: 'light' | 'dark') => void;
}

export function SettingsPanel({ refreshInterval, onRefreshIntervalChange, defaultTheme, onDefaultThemeChange }: SettingsPanelProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [alwaysSendEmail, setAlwaysSendEmail] = useState(false);
  const [notificationCheckInterval, setNotificationCheckInterval] = useState(0);
  const [notificationVoice, setNotificationVoice] = useState('Charon');
  const [monitorStatus, setMonitorStatus] = useState<{
    lastKnownVersion: string | null;
    isRunning: boolean;
    cronExpression: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [sendingDemoEmail, setSendingDemoEmail] = useState(false);
  const [demoEmailResult, setDemoEmailResult] = useState<'success' | 'error' | null>(null);

  const INTERVAL_OPTIONS = [
    { value: 0, label: t('settings.intervals.manualOnly') },
    { value: 60000, label: t('settings.intervals.oneMinute') },
    { value: 300000, label: t('settings.intervals.fiveMinutes') },
    { value: 900000, label: t('settings.intervals.fifteenMinutes') },
    { value: 1800000, label: t('settings.intervals.thirtyMinutes') },
    { value: 3600000, label: t('settings.intervals.oneHour') },
    { value: 7200000, label: t('settings.intervals.twoHours') },
    { value: 21600000, label: t('settings.intervals.sixHours') },
    { value: 86400000, label: t('settings.intervals.twentyFourHours') },
    { value: 604800000, label: t('settings.intervals.oneWeek') },
    { value: 1209600000, label: t('settings.intervals.twoWeeks') },
  ];

  const NOTIFICATION_INTERVALS = [
    { value: 0, label: t('settings.notificationIntervals.disabled') },
    { value: 300000, label: t('settings.notificationIntervals.everyFiveMinutes') },
    { value: 900000, label: t('settings.notificationIntervals.everyFifteenMinutes') },
    { value: 1800000, label: t('settings.notificationIntervals.everyThirtyMinutes') },
    { value: 3600000, label: t('settings.notificationIntervals.everyHour') },
    { value: 21600000, label: t('settings.notificationIntervals.everySixHours') },
    { value: 43200000, label: t('settings.notificationIntervals.everyTwelveHours') },
    { value: 86400000, label: t('settings.notificationIntervals.onceADay') },
    { value: 604800000, label: t('settings.notificationIntervals.onceAWeek') },
    { value: 1209600000, label: t('settings.notificationIntervals.everyTwoWeeks') },
  ];

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      loadSettings();
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/monitor/status'),
      ]);

      const settings = await settingsRes.json();
      const status = await statusRes.json();

      setEmailNotificationsEnabled(settings.emailNotificationsEnabled === 'true');
      setAlwaysSendEmail(settings.alwaysSendEmail === 'true');
      setNotificationCheckInterval(parseInt(settings.notificationCheckInterval) || 0);
      setNotificationVoice(settings.notificationVoice || 'Charon');
      setMonitorStatus(status);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSetting = async (key: string, value: string) => {
    try {
      await fetch(`/api/settings/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      // Refresh monitor status
      const statusRes = await fetch('/api/monitor/status');
      setMonitorStatus(await statusRes.json());
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  };

  const handleEmailNotificationsChange = async (enabled: boolean) => {
    setEmailNotificationsEnabled(enabled);
    await saveSetting('emailNotificationsEnabled', enabled.toString());
  };

  const handleAlwaysSendEmailChange = async (enabled: boolean) => {
    setAlwaysSendEmail(enabled);
    await saveSetting('alwaysSendEmail', enabled.toString());
  };

  const handleNotificationIntervalChange = async (interval: number) => {
    setNotificationCheckInterval(interval);
    await saveSetting('notificationCheckInterval', interval.toString());
  };

  const handleNotificationVoiceChange = async (voice: string) => {
    setNotificationVoice(voice);
    await saveSetting('notificationVoice', voice);
  };

  const testNotificationCheck = async () => {
    setTestingNotification(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/monitor/check', { method: 'POST' });
      if (res.ok) {
        setTestResult('success');
        // Refresh status after check
        const statusRes = await fetch('/api/monitor/status');
        setMonitorStatus(await statusRes.json());
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTestingNotification(false);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const sendDemoEmail = async () => {
    setSendingDemoEmail(true);
    setDemoEmailResult(null);
    try {
      const res = await fetch('/api/send-demo-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: notificationVoice }),
      });
      if (res.ok) {
        setDemoEmailResult('success');
      } else {
        setDemoEmailResult('error');
      }
    } catch {
      setDemoEmailResult('error');
    } finally {
      setSendingDemoEmail(false);
      setTimeout(() => setDemoEmailResult(null), 5000);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="p-2.5 text-charcoal-600 dark:text-cream-200 hover:text-charcoal-900 dark:hover:text-cream-50 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors"
        aria-label={t('settings.title')}
        title={t('settings.title')}
      >
        <Settings className="w-5 h-5" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-charcoal-800 rounded-xl shadow-2xl z-50 p-6 max-h-[90vh] overflow-y-auto transition-colors duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-charcoal-900 dark:text-cream-50">{t('settings.title')}</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-charcoal-500 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-lg transition-colors"
                aria-label={t('settings.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-coral-500" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Appearance Section */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-charcoal-900 dark:text-cream-50 mb-4">
                    <Moon className="w-4 h-4" />
                    {t('settings.appearance')}
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-charcoal-700 dark:text-cream-200">
                      {t('settings.useDarkModeDefault')}
                    </span>
                    <button
                      onClick={() => onDefaultThemeChange(defaultTheme === 'dark' ? 'light' : 'dark')}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        defaultTheme === 'dark' ? 'bg-teal-500' : 'bg-cream-400 dark:bg-charcoal-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          defaultTheme === 'dark' ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-cream-300 dark:border-charcoal-500" />

                {/* Auto-refresh interval */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-charcoal-700 dark:text-cream-200 mb-2">
                    <Clock className="w-4 h-4" />
                    {t('settings.autoRefreshInterval')}
                  </label>
                  <select
                    value={refreshInterval}
                    onChange={(e) => onRefreshIntervalChange(parseInt(e.target.value))}
                    className="w-full bg-cream-100 dark:bg-charcoal-700 border border-cream-300 dark:border-charcoal-500 rounded-xl px-4 py-2 text-charcoal-700 dark:text-cream-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                  >
                    {INTERVAL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Divider */}
                <div className="border-t border-cream-300 dark:border-charcoal-500" />

                {/* Email Notifications Section */}
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-medium text-charcoal-900 dark:text-cream-50 mb-4">
                    <Bell className="w-4 h-4" />
                    {t('settings.emailNotifications')}
                  </h3>

                  {/* Enable toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-charcoal-700 dark:text-cream-200">
                      {t('settings.notifyNewVersion')}
                    </span>
                    <button
                      onClick={() => handleEmailNotificationsChange(!emailNotificationsEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        emailNotificationsEnabled ? 'bg-teal-500' : 'bg-cream-400 dark:bg-charcoal-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          emailNotificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Always send email toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="text-sm text-charcoal-700 dark:text-cream-200">
                        {t('settings.sendOnEveryCheck')}
                      </span>
                      <p className="text-xs text-charcoal-500 dark:text-charcoal-400">
                        {t('settings.evenWhenNoNewVersion')}
                      </p>
                    </div>
                    <button
                      onClick={() => handleAlwaysSendEmailChange(!alwaysSendEmail)}
                      disabled={!emailNotificationsEnabled}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        alwaysSendEmail ? 'bg-teal-500' : 'bg-cream-400 dark:bg-charcoal-500'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          alwaysSendEmail ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Check interval */}
                  <div className="mb-4">
                    <label className="block text-sm text-charcoal-600 dark:text-charcoal-400 mb-1">
                      {t('settings.checkForNewVersions')}
                    </label>
                    <select
                      value={notificationCheckInterval}
                      onChange={(e) => handleNotificationIntervalChange(parseInt(e.target.value))}
                      disabled={!emailNotificationsEnabled}
                      className="w-full bg-cream-100 dark:bg-charcoal-700 border border-cream-300 dark:border-charcoal-500 rounded-xl px-4 py-2 text-charcoal-700 dark:text-cream-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors disabled:opacity-50"
                    >
                      {NOTIFICATION_INTERVALS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Voice selection for notifications */}
                  <div className="mb-4">
                    <label className="flex items-center gap-2 text-sm text-charcoal-600 dark:text-charcoal-400 mb-1">
                      <Volume2 className="w-4 h-4" />
                      {t('settings.audioVoiceForEmail')}
                    </label>
                    <select
                      value={notificationVoice}
                      onChange={(e) => handleNotificationVoiceChange(e.target.value)}
                      disabled={!emailNotificationsEnabled}
                      className="w-full bg-cream-100 dark:bg-charcoal-700 border border-cream-300 dark:border-charcoal-500 rounded-xl px-4 py-2 text-charcoal-700 dark:text-cream-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors disabled:opacity-50"
                    >
                      {VOICE_OPTIONS.map((voice) => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name} ({voice.tone})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Status indicator */}
                  {monitorStatus && (
                    <div className="p-3 bg-cream-100 dark:bg-charcoal-700/50 rounded-xl text-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-charcoal-600 dark:text-charcoal-400">{t('settings.cronStatus')}</span>
                        <span className={`flex items-center gap-1 ${monitorStatus.isRunning ? 'text-teal-600' : 'text-charcoal-500'}`}>
                          <span className={`w-2 h-2 rounded-full ${monitorStatus.isRunning ? 'bg-teal-500 animate-pulse' : 'bg-charcoal-400'}`} />
                          {monitorStatus.isRunning ? t('settings.running') : t('settings.stopped')}
                        </span>
                      </div>
                      {monitorStatus.cronExpression && (
                        <div className="text-charcoal-500 dark:text-charcoal-400 mb-1">
                          {t('settings.schedule')} <span className="font-mono text-xs bg-cream-200 dark:bg-charcoal-600 px-1.5 py-0.5 rounded">{monitorStatus.cronExpression}</span>
                        </div>
                      )}
                      {monitorStatus.lastKnownVersion && (
                        <div className="text-charcoal-500 dark:text-charcoal-400">
                          {t('settings.lastKnownVersion')} <span className="font-mono">{monitorStatus.lastKnownVersion}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Test button */}
                  <button
                    onClick={testNotificationCheck}
                    disabled={testingNotification || !emailNotificationsEnabled}
                    className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cream-200 dark:bg-charcoal-700 text-charcoal-700 dark:text-cream-200 rounded-xl hover:bg-cream-300 dark:hover:bg-charcoal-600 transition-colors disabled:opacity-50"
                  >
                    {testingNotification ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('settings.checking')}
                      </>
                    ) : testResult === 'success' ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-teal-500" />
                        {t('settings.checkComplete')}
                      </>
                    ) : (
                      t('settings.checkForNewVersionNow')
                    )}
                  </button>

                  {/* Demo Email Button */}
                  <button
                    onClick={sendDemoEmail}
                    disabled={sendingDemoEmail}
                    className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-coral-500 hover:bg-coral-600 text-white rounded-xl transition-colors disabled:opacity-50"
                  >
                    {sendingDemoEmail ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('settings.generatingSending')}
                      </>
                    ) : demoEmailResult === 'success' ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        {t('settings.emailSent')}
                      </>
                    ) : demoEmailResult === 'error' ? (
                      <>
                        <AlertCircle className="w-4 h-4" />
                        {t('settings.failedToSend')}
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        {t('settings.sendDemoEmail')}
                      </>
                    )}
                  </button>
                </div>

                {/* Info */}
                <div className="p-4 bg-coral-400/10 dark:bg-coral-600/10 rounded-xl border border-coral-400/30 dark:border-coral-600/30">
                  <p className="text-xs text-coral-700 dark:text-coral-400">
                    {t('settings.infoText')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
