"use client"

import { useState } from "react"
import { useAuth } from "@/components/providers"

export default function LogsPage() {
  const { session } = useAuth()
  const user = session?.user
  const isSignedIn = !!session
  const userId = user?.id
  const [logs, setLogs] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
    console.log(`[${timestamp}] ${message}`)
  }

  const clearLogs = () => {
    setLogs([])
  }

  const runFullTest = async () => {
    setLoading(true)
    clearLogs()
    
    try {
      addLog("🚀 Starting comprehensive authentication test...")
      
      // Step 1: Check Clerk authentication state
      addLog("📋 STEP 1: Checking Clerk authentication state")
      addLog(`   - isSignedIn: ${isSignedIn}`)
      addLog(`   - userId: ${userId || 'null'}`)
      addLog(`   - user.id: ${user?.id || 'null'}`)
      addLog(`   - user.email: ${user?.email || 'null'}`)
      
      if (!isSignedIn) {
        addLog("❌ User is not signed in - stopping test")
        return
      }
      
      // Step 2: Test JWT token generation
      addLog("📋 STEP 2: Testing JWT token generation")
      try {
        const token = session?.access_token
        addLog(`   - Token generated: ${token ? 'SUCCESS' : 'FAILED'}`)
        if (token) {
          addLog(`   - Token length: ${token.length}`)
          
          // Decode and show token payload
          try {
            const parts = token.split('.')
            if (parts.length === 3) {
              const payload = JSON.parse(atob(parts[1]))
              addLog(`   - Token payload:`)
              addLog(`     * email: ${payload.email || 'missing'}`)
              addLog(`     * aud: ${payload.aud || 'missing'}`)
              addLog(`     * role: ${payload.role || 'missing'}`)
              addLog(`     * sub: ${payload.sub || 'missing'}`)
              addLog(`     * exp: ${payload.exp || 'missing'}`)
              addLog(`     * iat: ${payload.iat || 'missing'}`)
            } else {
              addLog(`   - Invalid JWT format: ${parts.length} parts (expected 3)`)
            }
          } catch (decodeErr) {
            addLog(`   - Failed to decode JWT: ${decodeErr}`)
          }
        }
      } catch (tokenErr) {
        addLog(`   - JWT token generation failed: ${tokenErr}`)
      }
      
      // Step 3: Test API authentication
      addLog("📋 STEP 3: Testing API authentication")
      try {
        const response = await fetch('/api/modules/tasks', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        })
        
        addLog(`   - API response status: ${response.status}`)
        addLog(`   - API response ok: ${response.ok}`)
        
        const responseText = await response.text()
        addLog(`   - API response body: ${responseText}`)
        
        if (response.ok) {
          try {
            const data = JSON.parse(responseText)
            addLog(`   - Parsed response: ${Array.isArray(data) ? `${data.length} tasks` : 'not an array'}`)
          } catch (parseErr) {
            addLog(`   - Failed to parse JSON response: ${parseErr}`)
          }
        }
      } catch (apiErr) {
        addLog(`   - API call failed: ${apiErr}`)
      }
      
      // Step 4: Test with authentication header
      addLog("📋 STEP 4: Testing API with explicit authentication header")
      try {
        const token = session?.access_token
        if (token) {
          const response = await fetch('/api/modules/tasks', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          })
          
          addLog(`   - API response status (with auth): ${response.status}`)
          const responseText = await response.text()
          addLog(`   - API response body (with auth): ${responseText}`)
          
          if (response.ok) {
            try {
              const data = JSON.parse(responseText)
              addLog(`   - Tasks returned: ${Array.isArray(data) ? data.length : 'not an array'}`)
              if (Array.isArray(data) && data.length > 0) {
                addLog(`   - First 3 tasks:`)
                data.slice(0, 3).forEach((task, i) => {
                  addLog(`     ${i + 1}. ${task.title} (${task.status}) - email: ${task.user_email}`)
                })
              }
            } catch (parseErr) {
              addLog(`   - Failed to parse JSON response: ${parseErr}`)
            }
          }
        } else {
          addLog("   - No token available for authenticated request")
        }
      } catch (authApiErr) {
        addLog(`   - Authenticated API call failed: ${authApiErr}`)
      }
      
      // Step 5: Test database debug endpoint
      addLog("📋 STEP 5: Testing database debug endpoint (including backup table)")
      try {
        const response = await fetch('/api/debug-db')
        addLog(`   - Debug DB API status: ${response.status}`)
        const responseText = await response.text()
        
        if (response.ok) {
          try {
            const debugData = JSON.parse(responseText)
            addLog(`   - Main table count: ${debugData.tests.count.result}`)
            addLog(`   - Backup table test: ${debugData.tests.backupTable.error ? 'ERROR' : 'SUCCESS'}`)
            if (debugData.tests.backupTable.count !== undefined) {
              addLog(`   - Backup table count: ${debugData.tests.backupTable.count}`)
              if (debugData.tests.backupTable.sampleData && debugData.tests.backupTable.sampleData.length > 0) {
                addLog(`   - Found ${debugData.tests.backupTable.sampleData.length} records in backup table:`)
                debugData.tests.backupTable.sampleData.slice(0, 3).forEach((task, i) => {
                  addLog(`     ${i + 1}. ${task.title} (${task.status}) - email: ${task.user_email}`)
                })
              }
            }
          } catch (parseErr) {
            addLog(`   - Failed to parse debug response: ${parseErr}`)
            addLog(`   - Raw response: ${responseText.substring(0, 200)}...`)
          }
        } else {
          addLog(`   - Debug DB failed: ${responseText}`)
        }
      } catch (debugErr) {
        addLog(`   - Debug DB API failed: ${debugErr}`)
      }
      
      // Step 6: Test last completed task endpoint
      addLog("📋 STEP 6: Testing last completed task endpoint")
      try {
        const response = await fetch('/api/last-completed-task')
        addLog(`   - Last task API status: ${response.status}`)
        const responseText = await response.text()
        addLog(`   - Last task API body: ${responseText}`)
      } catch (lastTaskErr) {
        addLog(`   - Last completed task API failed: ${lastTaskErr}`)
      }
      
      addLog("✅ Comprehensive test completed")
      
    } catch (error) {
      addLog(`❌ Test failed with error: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>🔍 Authentication Debug Logs</h1>
      <p>This page performs comprehensive testing of the authentication flow</p>
      
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={runFullTest}
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: loading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            marginRight: '10px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? '🔄 Running Tests...' : '🚀 Run Full Authentication Test'}
        </button>
        
        <button 
          onClick={clearLogs}
          style={{
            padding: '10px 20px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          🗑️ Clear Logs
        </button>
      </div>
      
      <div style={{
        backgroundColor: '#000',
        color: '#00ff00',
        padding: '20px',
        borderRadius: '4px',
        fontFamily: 'monospace',
        fontSize: '14px',
        height: '600px',
        overflowY: 'scroll',
        whiteSpace: 'pre-wrap'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#888' }}>No logs yet. Click "Run Full Authentication Test" to start debugging.</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{ marginBottom: '4px' }}>
              {log}
            </div>
          ))
        )}
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <p>💡 This page tests:</p>
        <ul>
          <li>Clerk authentication state</li>
          <li>JWT token generation and validation</li>
          <li>API endpoint accessibility</li>
          <li>Database query results</li>
          <li>User email filtering</li>
        </ul>
      </div>
    </div>
  )
}