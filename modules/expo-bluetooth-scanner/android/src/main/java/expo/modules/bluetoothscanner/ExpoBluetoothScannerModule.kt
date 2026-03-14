// Level 04 — ExpoBluetoothScannerModule (Android)
// Demonstrates: BluetoothLeScanner, ScanCallback, permission checking, events.
//
// Android BLE key classes:
//   BluetoothAdapter      — entry point for all Bluetooth operations
//   BluetoothLeScanner    — the actual LE scanner (API 21+)
//   ScanCallback          — receives scan results asynchronously
package expo.modules.bluetoothscanner

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ExpoBluetoothScannerModule : Module() {

  // ScanCallback is the Android equivalent of CBCentralManagerDelegate.
  // It is called on a background thread by the BLE stack.
  private val scanCallback = object : ScanCallback() {

    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val device = result.device
      sendEvent("onDeviceFound", mapOf(
        "id"            to device.address,     // MAC address — stable on Android
        "name"          to (device.name ?: result.scanRecord?.deviceName ?: ""),
        "rssi"          to result.rssi,
        "isConnectable" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                              result.isConnectable else true
      ))
    }

    override fun onScanFailed(errorCode: Int) {
      isScanning = false
      sendEvent("onScanStateChanged", mapOf("isScanning" to false))
      sendEvent("onError", mapOf(
        "code"    to "SCAN_FAILED_$errorCode",
        "message" to "BLE scan failed with error code $errorCode"
      ))
    }
  }

  private var isScanning = false

  override fun definition() = ModuleDefinition {

    Name("ExpoBluetoothScanner")

    Events("onDeviceFound", "onScanStateChanged", "onError")

    // -------------------------------------------------------------------------
    // AsyncFunction: getState
    // -------------------------------------------------------------------------
    AsyncFunction("getState") {
      val adapter = getAdapter() ?: return@AsyncFunction "unsupported"
      if (!hasPermission("android.permission.BLUETOOTH_SCAN")) return@AsyncFunction "unauthorized"
      if (adapter.isEnabled) "poweredOn" else "poweredOff"
    }

    // -------------------------------------------------------------------------
    // Function: startScan
    // -------------------------------------------------------------------------
    Function("startScan") { allowDuplicates: Boolean ->
      val adapter = getAdapter()
      if (adapter == null) {
        sendEvent("onError", mapOf("code" to "UNSUPPORTED", "message" to "BLE not supported"))
        return@Function
      }
      if (!adapter.isEnabled) {
        sendEvent("onError", mapOf("code" to "BLUETOOTH_OFF", "message" to "Bluetooth is powered off"))
        return@Function
      }
      if (!hasPermission("android.permission.BLUETOOTH_SCAN")) {
        sendEvent("onError", mapOf("code" to "UNAUTHORIZED", "message" to "BLUETOOTH_SCAN permission not granted"))
        return@Function
      }
      if (isScanning) return@Function

      val settings = ScanSettings.Builder()
        // SCAN_MODE_LOW_LATENCY = fastest scan, most battery use. Fine for short sessions.
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        // Report delay 0 = results delivered immediately (not batched)
        .setReportDelay(0)
        .build()

      adapter.bluetoothLeScanner?.startScan(null, settings, scanCallback)
      isScanning = true
      sendEvent("onScanStateChanged", mapOf("isScanning" to true))
    }

    // -------------------------------------------------------------------------
    // Function: stopScan
    // -------------------------------------------------------------------------
    Function("stopScan") {
      if (!isScanning) return@Function
      getAdapter()?.bluetoothLeScanner?.stopScan(scanCallback)
      isScanning = false
      sendEvent("onScanStateChanged", mapOf("isScanning" to false))
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private fun getAdapter(): BluetoothAdapter? {
    val manager = appContext.reactContext
      ?.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  private fun hasPermission(permission: String): Boolean {
    val ctx = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(ctx, permission) == PackageManager.PERMISSION_GRANTED
  }
}
