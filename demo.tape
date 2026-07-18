# VHS demo script — https://github.com/charmbracelet/vhs
# 生成: vhs demo.tape → demo.gif (放进 README 顶部)
# 时长目标: <30s,一个镜头讲完核心价值

Output demo.gif
Set FontSize 15
Set Width 1100
Set Height 640
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Type "npx mcplint examples/bad-server.json"
Sleep 500ms
Enter
Sleep 4s

# 报告滚到顶部展示总分
Type "clear"
Enter
Type "# A spec-compliant server can still fail agents. mcplint scores what compliance checks can't."
Sleep 2s
Enter

Type "npx mcplint --stdio 'npx -y @modelcontextprotocol/server-memory'"
Sleep 500ms
Enter
Sleep 6s

Type "# B/81 — even official servers ship undocumented params. Fix list included."
Sleep 3s
Enter
