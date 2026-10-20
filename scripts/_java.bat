@echo off
rem Dung JDK trong tools\ neu co, neu khong dung java tren PATH
set "ROOT=%~dp0.."
set "JAVA=java"
for /d %%d in ("%ROOT%\tools\jdk-17*") do set "JAVA=%%d\bin\java.exe"
